export const POSTER_PRINT_SIZES = Object.freeze(['A5', 'A4']);
export const A4_PIXELS = Object.freeze({width: 2480, height: 3508});
export const MAX_POSTER_PIXELS = 100_000_000;
export const POSTER_DIMENSION_ERROR = 'Use an A-series portrait PNG at least 2480 × 3508 pixels or a square PNG at least 2480 × 2480 pixels.';

export function newPosterPrintSizes(sizes = POSTER_PRINT_SIZES) {
 if(!Array.isArray(sizes)||!['A5|A4','A4|A5','A5|A4|A3'].includes(sizes.join('|')))
  throw Error('Sizes must include A5 and A4. These are the two sizes offered on new poster uploads.');
 // Older collection manifests can still be imported with the current offerings.
 return [...POSTER_PRINT_SIZES];
}

export function posterPrintLayout(width,height,legacyA3=false) {
 const error=legacyA3?'PNG must match A-series and meet at least 270 PPI at A3':POSTER_DIMENSION_ERROR;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>MAX_POSTER_PIXELS)
  throw Error(error);
 if(!legacyA3&&width===height&&width>=A4_PIXELS.width)return 'square';
 const enoughPixels=legacyA3
  ? Math.min(width*25.4/297,height*25.4/420)>=270
  : width>=A4_PIXELS.width&&height>=A4_PIXELS.height;
 if(!enoughPixels||Math.abs(height/width/Math.SQRT2-1)>0.02)throw Error(error);
 return 'portrait';
}
