const sheets = {
 'case-portraits': { width: 2172, height: 724, columns: 4, rows: 1 },
 'rulebook-art': { width: 2172, height: 724, columns: 3, rows: 1 },
 'roadtrip-art': { width: 1536, height: 1024, columns: 3, rows: 2 },
 'advent-art': { width: 1536, height: 1024, columns: 3, rows: 2 },
 'cooking-art': { width: 1254, height: 1254, columns: 2, rows: 2 },
 'planet-art': { width: 1774, height: 887, columns: 4, rows: 2 },
};
export default function Sticker({ sheet, index = 0 }: { readonly sheet: keyof typeof sheets; readonly index?: number }) @{
 const atlas = sheets[sheet];
 const width = atlas.width / atlas.columns;
 const height = atlas.height / atlas.rows;
 const cookingCrops = [[0, 0, 705, 822], [724, 285, 530, 540], [80, 816, 530, 438], [650, 833, 604, 421]];
 const crop = sheet === 'cooking-art' ? cookingCrops[index] : [(index % atlas.columns) * width, Math.floor(index / atlas.columns) * height, width, height];
 const cropStyle = `aspect-ratio:${crop[2]}/${crop[3]};`;
 const imageStyle = `width:${atlas.width / crop[2] * 100}%;height:${atlas.height / crop[3] * 100}%;left:${-crop[0] / crop[2] * 100}%;top:${-crop[1] / crop[3] * 100}%;`;
 <span class="sticker" aria-hidden="true"><span class="crop" style={cropStyle}><img src={'/markless/accordion-art/' + sheet + '.png'} alt="" width={atlas.width} height={atlas.height} style={imageStyle} loading="lazy" /></span>
  <style>.sticker { display:grid; place-items:center; width:100%; height:100%; }.crop { display:block; position:relative; width:100%; max-height:100%; overflow:hidden; }img { position:absolute; display:block; max-width:none; object-fit:fill; }</style>
 </span>;
}
