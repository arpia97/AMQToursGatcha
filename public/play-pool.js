export const playPools = Object.freeze(['random','watched']);
export const poolName = pool => pool === 'mixed' ? 'Mixed' : pool === 'watched' ? 'Watched' : 'Random';
export const poolFormat = (format,pool) => pool === 'watched' ? format+'-watched' : format;
