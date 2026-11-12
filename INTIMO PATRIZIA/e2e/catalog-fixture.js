import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, setDoc, doc, getDoc, getDocs, collection, terminate, Timestamp } from 'firebase/firestore';

const emulatorHost=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080';
if(!/^127\.0\.0\.1:\d+$/.test(emulatorHost))throw new Error('Browser tests require a loopback Firestore emulator.');
const demo=JSON.parse(readFileSync(new URL('../public/data/demo-catalog.json',import.meta.url),'utf8'));

// The original sample-catalog visual checks remain deterministic; the substantive
// auth/CRUD/sync tests below use the real adapter, SDK and Firestore rules.
export async function demoCatalog(page) {
  await page.route(url=>url.pathname==='/src/firestore-catalog.js',route=>route.fulfill({contentType:'application/javascript',body:`
    export const loadPublicCatalog=async()=>(${JSON.stringify(demo)});
    export const loadPublicCatalogPage=async()=>({...${JSON.stringify(demo)},complete:true,nextCursor:null});
    export const loadPublicCatalogPreview=async()=>({...${JSON.stringify(demo)},complete:true,nextCursor:null});
    export const loadPublicProductsByIds=async({ids=[]}={})=>(${JSON.stringify(demo.products)}).filter(product=>ids.includes(product.id));
    export const loadProductGallery=async(product)=>({images:product.image?[{slot:0,src:product.image,alt:product.imageAlt||product.name}]:[],release(){}});
    export const loadManagerCatalogPage=async()=>{throw new Error('Sample is readonly');};
    export const readPublicVersion=async()=>'sample';
    export const getCatalogSession=async()=>({canManageCatalog:false});
    export const catalogRequest=async()=>{throw new Error('Sample is readonly');};
    export const getCatalogImage=async()=>{throw new Error('No sample upload');};
    export const getFirestoreContext=async()=>{throw new Error('Sample profiles are unavailable');};
  `}));
}

export async function isolatedCatalog(seed={},identity={email:'alessandroferrara01@libero.it',email_verified:true}) {
  const projectId=`demo-intimo-e2e-${randomUUID().slice(0,8)}`;
  const origin=`http://${emulatorHost}`;
  const rulesResponse=await fetch(`${origin}/emulator/v1/projects/${projectId}:securityRules`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}]}}),signal:AbortSignal.timeout(15000)});
  if(!rulesResponse.ok)throw new Error(`Could not load local test rules: ${await rulesResponse.text()}`);
  const compile=await rulesResponse.json();if(compile.issues?.some(issue=>issue.severity==='ERROR'))throw new Error(JSON.stringify(compile.issues));
  const app=initializeApp({projectId,apiKey:'test-key',appId:'test-app'},projectId);
  const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',Number(emulatorHost.split(':')[1]),{mockUserToken:'owner'});
  const records=new Map(Object.entries(seed));
  const timestamp=Timestamp.now();
  let categoryCount=0;let productCount=0;
  for(const [path,value] of [...records]) {
    if(path.startsWith('categories/')) {
      categoryCount++;const id=path.split('/')[1];const count=[...records].filter(([key,item])=>key.startsWith('products/')&&item.categoryId===id).length;
      records.set(path,{description:'',image:'',productCount:count,lastProductId:'',updatedAt:timestamp,...value});
      records.set(`categorySlugs/${value.slug}`,{categoryId:id});
    }
    if(path.startsWith('products/')) {productCount++;records.set(path,{description:'',price:null,sizes:[],colors:[],material:'',image:'',imageAlt:'',available:true,published:true,isDemo:false,order:0,updatedAt:timestamp,...value});}
  }
  if(records.size){records.set('catalogMeta/inventory',{categoryCount,productCount,lastCategoryId:'',lastProductId:'',updatedAt:timestamp});records.set('catalogMeta/revision',{version:randomUUID()});}
  await Promise.all([...records].map(([path,value])=>setDoc(doc(db,path),value)));
  const now=Math.floor(Date.now()/1000);const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt=`${encode({alg:'none',typ:'JWT'})}.${encode({aud:projectId,iss:`https://securetoken.google.com/${projectId}`,sub:'test-owner',user_id:'test-owner',...identity,iat:now,exp:now+3600,auth_time:now,firebase:{sign_in_provider:'password'}})}.`;
  let controlPage;
  return {
    async close(){await terminate(db);await deleteApp(app);},
    async inspect(path){const snapshot=await getDoc(doc(db,path));return snapshot.exists()?snapshot.data():undefined;},
    async list(name){return (await getDocs(collection(db,name))).docs.map(snapshot=>({id:snapshot.id,...snapshot.data()}));},
    async request(method,path,body){
      if(!controlPage)throw new Error('Route and log in the control page before using the real catalog adapter.');
      return controlPage.evaluate(async({method,path,body})=>{
        const adapter=await import('/src/firestore-catalog.js?actual');
        return path==='/api/catalog'?adapter.loadPublicCatalog():adapter.catalogRequest(path.replace('/api/admin/',''),method,body);
      },{method,path,body});
    },
    async route(page,metrics={catalog:0,version:0,failedVersions:0,admin:0,session:0,auth:[]}) {
      controlPage??=page;
      await page.route('**/__/firebase/init.json',route=>route.fulfill({json:{apiKey:'test-key',authDomain:`${projectId}.firebaseapp.com`,projectId,appId:'test-app'}}));
      await page.route(/(?:https:\/\/identitytoolkit\.googleapis\.com|http:\/\/127\.0\.0\.1:9099\/identitytoolkit\.googleapis\.com)\/.*/,route=>{
        const action=new URL(route.request().url()).pathname.split(':').at(-1);metrics.auth.push(action);
        if(['signInWithPassword','signUp'].includes(action))return route.fulfill({json:{localId:'test-owner',email:identity.email,displayName:'Test account',idToken:jwt,refreshToken:'test-refresh',expiresIn:'3600',registered:true}});
        if(action==='sendOobCode')return route.fulfill({json:{email:identity.email}});
        return route.fulfill({json:{users:[{localId:'test-owner',email:identity.email,emailVerified:identity.email_verified,providerUserInfo:[{providerId:'password',email:identity.email,rawId:identity.email}]}]}});
      });
      await page.exposeFunction('__catalogTestEvent',kind=>{
        if(kind==='version-start'&&metrics.failNextVersion){metrics.failNextVersion=false;metrics.failedVersions++;return true;}
        if(kind==='version-done')metrics.version++;
        if(kind==='catalog-start')metrics.catalog++;
        if(kind==='admin-start')metrics.admin++;
        if(kind==='session-start')metrics.session++;
        return false;
      });
      // Wrap only for counters and a deterministic one-shot read outage. Every
      // successful operation delegates unchanged to the actual production module.
      await page.route(url=>url.pathname==='/src/firestore-catalog.js'&&!url.searchParams.has('actual'),route=>route.fulfill({contentType:'application/javascript',body:`
        import * as real from '/src/firestore-catalog.js?actual';
        export * from '/src/firestore-catalog.js?actual';
        async function run(kind,call){window.__catalogTestPending=(window.__catalogTestPending||0)+1;try{await window.__catalogTestEvent(kind+'-start');return await call();}finally{window.__catalogTestPending--;}}
        export async function readPublicVersion(signal){try{if(await window.__catalogTestEvent('version-start'))throw new Error('Temporary test outage');return await real.readPublicVersion(signal);}finally{await window.__catalogTestEvent('version-done');}}
        export const loadPublicCatalog=signal=>run('catalog',()=>real.loadPublicCatalog(signal));
        export const loadPublicCatalogPage=options=>run('catalog',()=>real.loadPublicCatalogPage(options));
        export const loadManagerCatalogPage=options=>run('admin',()=>real.loadManagerCatalogPage(options));
        export const getCatalogSession=signal=>run('session',()=>real.getCatalogSession(signal));
        export const catalogRequest=(...args)=>run('admin',()=>real.catalogRequest(...args));
      `}));
      return metrics;
    }
  };
}
