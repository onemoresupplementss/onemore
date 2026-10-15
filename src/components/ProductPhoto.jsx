// Main product photo. Follows the size/flavour picked in the buy box when that option has its own photo.
import ProductImage from './ProductImage.jsx';
import { selectedVariant, useSignal } from '../client/store.js';

export default function ProductPhoto({ variants, image, brand, name }) {
  const id = useSignal(selectedVariant);
  const v = variants.find((x) => x.id === id) || variants[0];
  return <ProductImage src={v.image || image} brand={brand} name={name} size={v.size} eager />;
}
