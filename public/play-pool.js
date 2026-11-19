export const playPools = Object.freeze(['random','watched']);
export const poolName = pool => pool === 'watched' ? 'Watched' : 'Random';
export const poolFormat = (format,pool) => pool === 'watched' ? format+'-watched' : format;
