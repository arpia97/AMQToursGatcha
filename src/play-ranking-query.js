// Assign the mode's usual rank before applying the viewer's filter, sort and page.
export function playRankingPage(read, source, args, {quiz=false, page=0, sort, dir, friendIds=null, viewer=null}={}) {
  const defaultSort=quiz?'points':'rank';
  const columns={
    rank:'rank', name:'name COLLATE NOCASE', matches:'matches', points:'correct',
    accuracy:'1.0 * correct / NULLIF(seen,0)',
    ...(quiz?{time:'avgTimeMs'}:{rating:'rating',record:'wins'})
  };
  const field=Object.hasOwn(columns,sort)?sort:defaultSort;
  const order=dir==='desc'||(dir==null&&quiz&&field==='points')?'DESC':'ASC';
  const reverse=order==='ASC'?'DESC':'ASC';
  const ordering=field==='record'
    ? 'wins '+order+' NULLS LAST, losses '+reverse+', ties '+order
    : columns[field]+' '+order+' NULLS LAST';
  const defaultOrder=quiz?'correct DESC,matches DESC,player':'rating DESC,correct DESC,player';
  const scope=friendIds===null?'':'WHERE player IN (SELECT value FROM json_each(?))';
  const filterArgs=friendIds===null?[]:[JSON.stringify(friendIds)];
  const standings=`WITH standings AS (${source}), ranked AS (
    SELECT *,ROW_NUMBER() OVER (ORDER BY ${defaultOrder}) AS rank FROM standings)`;
  const pageQuery=`SELECT * FROM ranked ${scope} ORDER BY ${ordering},rank LIMIT 51 OFFSET ?`;
  const params=[...args,...filterArgs,page*50];
  const rows=viewer==null ? read(standings+' '+pageQuery,...params) : read(
    `${standings}, page_rows AS (${pageQuery})
     SELECT * FROM (
       SELECT page_rows.*,0 AS pinned FROM page_rows
       UNION ALL SELECT ranked.*,1 AS pinned FROM ranked WHERE player=?
     ) ORDER BY pinned DESC,${ordering},rank`,...params,viewer);
  const formatRow=({player,wins,losses,ties,pinned,...row})=>({
    id:player,...row,...(quiz?{}:{record:wins==null?null:[wins,losses,ties]})
  });
  const own=rows[0]?.pinned===1?formatRow(rows.shift()):null;
  return {rows:rows.slice(0,50).map(formatRow),own,more:rows.length>50,...(friendIds===null?{}:{friendsOnly:true})};
}
