export const FRAME_NOTE='FRAME IMAGES\nFrame images are illustrative mockups. The actual frame profile, finish and proportions may vary from those shown. You will receive the frame colour selected when ordering.';
export function physicalDescription(value) {
 let text=String(value||'').trim()
  .replace(/One physical, unframed paper poster in your selected size\./gi,'One physical paper poster in your selected size and finish.')
  .replace(/A frame, mount and hanging accessories are not included\./gi,'Print Only does not include a frame, mount or hanging accessories.');
 if(!text.includes('Choose Print Only, Black Frame, White Frame or Oak Frame.'))text+='\n\nFINISH OPTIONS\nChoose Print Only, Black Frame, White Frame or Oak Frame.\nPrint Only is unframed. Framed options include the frame colour selected when ordering.';
 if(!text.includes(FRAME_NOTE))text+='\n\n'+FRAME_NOTE;
 if(!text.includes('Room scenes and accessories are for illustration only and are not included.'))text+='\nRoom scenes and accessories are for illustration only and are not included. Check the listed A5, A4 and A3 dimensions before ordering.';
 if(text.length>10000)throw Error('Physical print description is too long after finish information');
 return text;
}
