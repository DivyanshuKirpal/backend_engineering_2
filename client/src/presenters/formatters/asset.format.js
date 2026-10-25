// Asset tiles (section 7): the letter each lettered tile shows, standing in
// for /coins/*.svg. BNB is N, as on the UI kit, because B is Bitcoin's.

const LETTERS = { USDT: 'T', BTC: 'B', ETH: 'E', SOL: 'S', BNB: 'N' };

export function tile(code) {
  return { code, letter: LETTERS[code] ?? String(code ?? '?').slice(0, 1).toUpperCase() };
}

/** "Bitcoin" from the assets list, or the code when the list isn't loaded yet. */
export function assetName(code, assetList) {
  return assetList.find((a) => a.code === code)?.name ?? code;
}
