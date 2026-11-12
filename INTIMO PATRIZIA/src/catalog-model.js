export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').trim();
export function selectProducts(products, {categoryId='',query='',sort='recommended'}={}) {
  const search=normalizeSearch(query);
  const result=products.filter(product=>product.published!==false && (!categoryId || product.categoryId===categoryId) && (!search || normalizeSearch([product.name,product.description,product.material,...(product.colors||[])].join(' ')).includes(search)));
  const byName=(a,b)=>a.name.localeCompare(b.name,'it');
  if(sort==='price-asc') result.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity)||byName(a,b));
  else if(sort==='price-desc') result.sort((a,b)=>(b.price??-Infinity)-(a.price??-Infinity)||byName(a,b));
  else if(sort==='name') result.sort(byName);
  else result.sort((a,b)=>(a.order??0)-(b.order??0)||byName(a,b));
  return result;
}
export const isSafeImage = value => typeof value==='string' && /^\/(?:assets\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g|avif|svg)|api\/images\/[A-Za-z0-9_-]+)$/.test(value) && !value.includes('..');
export function visibleCatalog(data) {
  if(!Array.isArray(data?.categories)||!Array.isArray(data?.products)) throw new Error('Dati del catalogo non validi.');
  const categories=data.categories.filter(category=>category.published!==false).sort((a,b)=>(a.order??0)-(b.order??0));
  const ids=new Set(categories.map(category=>category.id));
  return {...data,categories,products:data.products.filter(product=>product.published!==false&&ids.has(product.categoryId))};
}
