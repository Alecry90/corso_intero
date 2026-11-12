import './home-merchandising.css';
import { getFirestoreContext, readPublicVersion } from './firestore-catalog.js';
import { createCatalogSync } from './catalog-sync.js';
import { compareCatalogProducts } from './catalog-pager.js';
import { createCatalogImages } from './catalog-images.js';
import { isSafeImage } from './catalog-model.js';
import { productIsAvailable } from './product-variants.js';

const node = (tag, className, text) => { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; };
const euro = new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'});
const check = signal => { if (signal?.aborted) throw new DOMException('Operazione interrotta.','AbortError'); };
async function reading(promise,signal) {
  check(signal);
  if (!signal) return promise;
  return new Promise((resolve,reject) => {
    const abort = () => reject(new DOMException('Operazione interrotta.','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

export async function loadHomeMerchandising(signal) {
  const {db,sdk} = await reading(getFirestoreContext(),signal);
  const snapshot = await reading(sdk.getDocsFromServer(sdk.query(sdk.collection(db,'categories'),sdk.where('published','==',true),sdk.limit(50))),signal);
  const categories = snapshot.docs.map(item=>({id:item.id,...item.data()}));
  const active = categories.filter(category=>category.productCount !== 0);
  const selections = await Promise.all(['newArrival','featured'].map(async flag => {
    const pages = await Promise.all(active.map(async category => {
      check(signal);
      const result = await reading(sdk.getDocsFromServer(sdk.query(sdk.collection(db,'products'),sdk.where('categoryId','==',category.id),sdk.where('published','==',true),sdk.where('isDemo','==',false),sdk.where('available','==',true),sdk.where(flag,'==',true),sdk.orderBy('order'),sdk.orderBy('name'),sdk.orderBy(sdk.documentId()),sdk.limit(4))),signal);
      return result.docs.map(item=>({id:item.id,...item.data()}));
    }));
    return pages.flat().filter(productIsAvailable).sort(compareCatalogProducts).slice(0,4);
  }));
  return { categories, newArrival:selections[0], featured:selections[1] };
}

export function initializeHomeMerchandising() {
  const images = createCatalogImages();
  const sections = {newArrival:document.getElementById('home-new-arrivals'),featured:document.getElementById('home-featured')};
  if (!sections.newArrival || !sections.featured) return;
  const render = data => {
    images.reset();
    for (const [flag,section] of Object.entries(sections)) {
      const list = section.querySelector('ul');
      list.replaceChildren(...data[flag].map(product=> {
        const item = node('li'); item.dataset.productId = product.id;
        const link = node('a','merch-product'); link.href = `/catalogo.html?${new URLSearchParams({prodotto:product.id})}`;
        const picture = node('div','merch-product-photo');
        if (isSafeImage(product.image)) { const image=node('img'); image.width=720;image.height=900;image.loading='lazy';image.alt=product.imageAlt||product.name; picture.append(image);images.show(image,product.image); }
        else picture.append(node('span','','Fotografia non disponibile'));
        const description=node('div','merch-product-copy');
        const category=data.categories.find(item=>item.id===product.categoryId);
        description.append(node('p','merch-product-category',category?.name||''),node('h3','',product.name),node('p','merch-product-price',typeof product.price==='number'?euro.format(product.price):'Informazioni in negozio'));
        link.append(picture,description);item.append(link);return item;
      }));
      section.hidden = data[flag].length === 0;
    }
  };
  createCatalogSync({readVersion:readPublicVersion,readCatalog:async signal=>({data:await loadHomeMerchandising(signal),source:'api'}),onData:({data})=>render(data),onError:()=>{}}).start();
}
