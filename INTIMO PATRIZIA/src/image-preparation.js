export async function compressedImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Scegli un file JPG, PNG, WebP o AVIF. I file SVG non sono supportati.');
  if (file.size > 12 * 1024 * 1024) throw new Error('La fotografia supera 12 MB. Scegli una versione più leggera.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 70000000) throw new Error('La fotografia è troppo grande o non è leggibile. Scegli una versione più piccola.');
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); let width = Math.max(1, Math.round(image.naturalWidth * scale)); let height = Math.max(1, Math.round(image.naturalHeight * scale));
    let blob;
    for (let attempt = 0; attempt < 12; attempt++) {
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Il browser non può elaborare la fotografia. Prova con un browser aggiornato.');
      context.fillStyle = '#f9f6f0'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
      const quality = Math.max(.48, .86 - Math.min(attempt, 4) * .09);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      if (!blob) blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 300 * 1024 && ['image/webp', 'image/jpeg'].includes(blob.type)) break;
      if (attempt >= 3) { width = Math.max(1, Math.round(width * .82)); height = Math.max(1, Math.round(height * .82)); }
    }
    if (!blob || blob.size > 300 * 1024 || !['image/webp', 'image/jpeg'].includes(blob.type)) throw new Error('La foto non può essere compressa abbastanza. Prova una fotografia più semplice o più piccola.');
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Impossibile leggere la fotografia.')); reader.readAsDataURL(blob); });
    return { data, size: blob.size, width, height };
  } catch (error) {
    if (error?.name === 'EncodingError') throw new Error('Il file non contiene una fotografia leggibile. Scegli un altro file.');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}

