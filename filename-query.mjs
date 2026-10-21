// LIKE ... ESCAPE prevents SQLite FTS5 trigram optimization. Use an unescaped
// literal anchor for indexed candidate selection, then preserve exact escaping.
// Values are always bound parameters; punctuation is never SQL syntax.
const escaped=value=>'%'+value.replace(/[\\%_]/g,x=>'\\'+x)+'%';
export function filenameQuery(query,maximum){
 const name=query.toLowerCase();
 const anchor=name.split(/[\\%_]/).sort((a,b)=>[...b].length-[...a].length)[0]??'';
 if([...anchor].length>=3){
  const exact=anchor===name;
  return {strategy:'TRIGRAM',sql:'SELECT e.fullpath path,e.name,e.kind FROM names_fts f JOIN entries e ON e.id=f.rowid WHERE f.name LIKE ?'+
   (exact?'':" AND e.name LIKE ? ESCAPE '\\'")+' LIMIT ?',
   parameters:exact?['%'+anchor+'%',maximum]:['%'+anchor+'%',escaped(name),maximum]};
 }
 return {strategy:'LITERAL_SCAN',sql:"SELECT fullpath path,name,kind FROM entries WHERE name LIKE ? ESCAPE '\\' LIMIT ?",parameters:[escaped(name),maximum]};
}
