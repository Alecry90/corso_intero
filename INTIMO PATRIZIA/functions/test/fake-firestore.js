// Transactional model for repository invariants. This is not an emulator or rules test.
class Snapshot {
  constructor(ref, value) { this.ref = ref; this.id = ref.id; this.exists = value !== undefined; this.value = value; }
  data() { return this.value; }
}
class Query {
  constructor(db, name, filters = [], maximum = Infinity) { this.db = db; this.name = name; this.filters = filters; this.maximum = maximum; }
  where(field, operator, value) { if (operator !== '==') throw new Error('Unsupported query'); return new Query(this.db, this.name, [...this.filters, [field, value]], this.maximum); }
  limit(n) { return new Query(this.db, this.name, this.filters, n); }
  async get() {
    const docs = [];
    for (const [path, value] of this.db.documents) {
      if (path.split('/')[0] === this.name && this.filters.every(([key, wanted]) => value[key] === wanted)) docs.push(new Snapshot(new Ref(this.db, path), value));
    }
    return { docs: docs.slice(0, this.maximum), size: Math.min(docs.length, this.maximum), empty: docs.length === 0 };
  }
  doc(id = `generated_${++this.db.sequence}`) { return new Ref(this.db, `${this.name}/${id}`); }
}
class Ref {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/')[1]; }
  async get() { return new Snapshot(this, this.db.documents.get(this.path)); }
}
export class FakeFirestore {
  constructor(seed = {}) { this.documents = new Map(Object.entries(seed)); this.sequence = 0; }
  collection(name) { return new Query(this, name); }
  async runTransaction(run) {
    const writes = [];
    const transaction = {
      get: (ref) => ref.get(),
      set: (ref, data) => writes.push(() => this.documents.set(ref.path, data)),
      create: (ref, data) => writes.push(() => { if (this.documents.has(ref.path)) throw new Error('Already exists'); this.documents.set(ref.path, data); }),
      update: (ref, data) => writes.push(() => { if (!this.documents.has(ref.path)) throw new Error('Missing document'); this.documents.set(ref.path, { ...this.documents.get(ref.path), ...data }); }),
      delete: (ref) => writes.push(() => this.documents.delete(ref.path))
    };
    const result = await run(transaction);
    for (const write of writes) write();
    return result;
  }
}
