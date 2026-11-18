// Assign the mode's usual rank before applying the viewer's sort and page.
export function playRankingPage(read, source, args, {quiz=false, page=0, sort='rank', dir='asc'}={}) {
  const order=dir==='desc'?'DESC':'ASC';
  const reverse=order==='ASC'?'DESC':'ASC';
  const columns={
    rank:'rank', name:'name COLLATE NOCASE', matches:'matches', points:'correct',
    accuracy:'1.0 * correct / NULLIF(seen,0)',
    ...(quiz?{time:'avgTimeMs'}:{rating:'rating',record:'wins'})
  };
  const field=Object.hasOwn(columns,sort)?sort:'rank';
  const ordering=field==='record'
    ? 'wins '+order+' NULLS LAST, losses '+reverse+', ties '+order
    : columns[field]+' '+order+' NULLS LAST';
  const defaultOrder=quiz?'correct DESC,matches DESC,player':'rating DESC,correct DESC,player';
  const rows=read(`WITH standings AS (${source}), ranked AS (
    SELECT *,ROW_NUMBER() OVER (ORDER BY ${defaultOrder}) AS rank FROM standings)
    SELECT * FROM ranked ORDER BY ${ordering},rank LIMIT 51 OFFSET ?`,...args,page*50);
  return {rows:rows.slice(0,50).map(({player,wins,losses,ties,...row})=>quiz?row:{
    ...row,record:wins==null?null:[wins,losses,ties]
  }),more:rows.length>50};
}
