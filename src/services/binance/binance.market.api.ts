export type Binance24hTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
};

export async function fetch24hTickers(signal?: AbortSignal): Promise<Binance24hTicker[]> {
  const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", { signal });
  if (!res.ok) throw new Error(`Binance 24hr error: ${res.status}`);
  return res.json();
}
