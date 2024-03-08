/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

async function get_ohlc_data(resolution,slug,year,all,date = null) {
  console.log('OHLC entred');
  let fromDate = new Date();
  let formattedDate
  if(year === true){
    fromDate.setFullYear(fromDate.getFullYear() - 1);
    formattedDate = fromDate.toISOString().split('T')[0];
  }else if(all === true && date !== null){
    formattedDate = date
  }else{
    fromDate.setMonth(fromDate.getMonth() - 1);
    fromDate.setDate(fromDate.getDate() - 1);
    formattedDate = fromDate.toISOString().split('T')[0];
  }
  const base_url = `https://mainnet.gomaestro-api.org/v1/markets/dexs/ohlc/minswap/ADA-${slug}`;
  const url = `${base_url}?resolution=${resolution}&api-key={api_key}&sort=desc&from=${formattedDate}&limit=50000`;
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching data:', error.message);
    return { 'error': error.message || 'Unknown error' };
  }
}
function calculatePercentageChange(close, open) {
  if(open === 0){
    return 0
  }
  return ((close - open) / open) * 100;
}
function changeInUsd(ADA,matchingEntry,targetTimestamp){
  let lastElement
  for (let i = matchingEntry.length - 1; i >= 0; i--) {
    const dataTimestamp = matchingEntry[i][0];
    if(dataTimestamp <= targetTimestamp){
      lastElement = matchingEntry[i]
      break
    }
  }
  const close_price = parseFloat(lastElement[4]);

  const Volume_in_USD = ADA * close_price;
  console.log(Volume_in_USD)
  if (String(Volume_in_USD).includes("e")) {
    console.log(String(Volume_in_USD))
    const parts = String(Volume_in_USD).split('e');
    const integerPart = parts[0] ? parseFloat(parts[0]) : 0;
    return integerPart
  } else {
    console.log("ADA_in_USD:", Volume_in_USD);
    return (Volume_in_USD)
  }
}
async function conversion_in_usd(ADA, timestamp,interval,onlyData,complete,usdData = null) {
  const api_url = `https://api.kraken.com/0/public/OHLC?pair=ADAUSD&since=0&interval=${interval}`;
  // try {
    let data
    if(complete === true && usdData !== null){
      data = usdData
    }else{
      let maxRetries = 3;
      let currentRetry = 0;
      while (currentRetry < maxRetries) {
        const response = await fetch(api_url);
      
        if (response.status === 200) {
          data = await response.json();
          break;
        } else {
          currentRetry++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    const matchingEntry = data['result']['ADAUSD'];
    if(onlyData === true){
      return matchingEntry
    }
    let lastIndex
    let lastElement
    if(interval === 1){
      lastIndex = matchingEntry.length - 1;
      lastElement = matchingEntry[lastIndex];
    }else if(interval === 5 || interval === 15){
      const targetTimestamp = timestamp.getTime() / 1000;
      lastIndex = matchingEntry.length - 1
      let check = 0
      for (let i = matchingEntry.length - 1; i >= 0; i--) {
        const dataTimestamp = matchingEntry[i][0];
        if(dataTimestamp <= targetTimestamp){

          lastElement = matchingEntry[i]
          check = 1
          break
        }
      }
      if(check === 0){
        lastElement = matchingEntry[0]
      }
    }else if(interval === 60){
      lastElement = matchingEntry[0]
    }

    if (!matchingEntry) {
      console.error('No matching entry found for the given timestamp');
      return null;
    }
    const close_price = parseFloat(lastElement[4]);
    const ADA_in_USD = ADA * close_price;
    console.log(ADA_in_USD)
    if (String(ADA_in_USD).includes("e")) {
      const parts = String(ADA_in_USD).split('e');
      const integerPart = parts[0] ? parseFloat(parts[0]) : 0;
      return integerPart
    } else {
      return (ADA_in_USD)
    }
  // } catch (error) {
  //   console.error(`Error: ${error}`);
  //   return null;
  // }
}

function getTargetData(Res1m, target_timestamp) {
  let target_data = null;
  let index = 0
  let check = 0
  for (const entry of Res1m) {
    const entry_time = new Date(entry['timestamp']);
    if (entry_time <= target_timestamp) {
      target_data = entry;
      check = 1
      break;
    }
    index += 1
  }
  if(check === 0){
    index = Res1m.length-1
    target_data = Res1m[index]
  }
  return {index: index,target_data: target_data};
}
async function get_pair_info(slug) {
  const base_url = 'https://mainnet.gomaestro-api.org/v1/markets/dexs/minswap?api-key={api_key}';

  try {
    const response = await fetch(base_url);
    const data = await response.json();

    for (const pair of data['pairs']) {
      if (pair['pair'] === `ADA-${slug}`) {
        return pair['coin_b_policy'] + pair['coin_b_asset_name'];
      }
    }

    return null;
  } catch (error) {
    console.error(`Error: ${error}`);
    return null;
  }
}
async function getAssetData(assetId) {
  const asset_url = `https://mainnet.gomaestro-api.org/v1/assets/${assetId}?api-key={api_key}`;

  try {
    const response = await fetch(asset_url);
    const data = await response.json();

    return data
  } catch (error) {
    console.error(`Error: ${error}`);
    return null;
  }
}

async function marketData(slug) {
  const api_url = `https://mainnet.gomaestro-api.org/v1/markets/dexs/stats/minswap/ADA-${slug}?api-key={api_key}`;

  try {
    const response = await fetch(api_url);
    const data = await response.json();
    return {'total_supply': data?.market_cap?.coin_b_total_supply,
    'circulating_supply':data?.market_cap?.coin_b_circulating_supply,
    'fully_diluted_market_cap':data?.market_cap?.coin_b_fully_diluted_market_cap,
    'market_cap':data?.market_cap?.coin_b_market_cap}

  } catch (error) {
    console.error(`Error: ${error}`);
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    const body = await request.text();
    console.log(body);
    const payload = JSON.parse(body)
    console.log(payload);
    const slug = payload["slug"];
    console.log(slug);
    const fullName = payload["fullName"]
    const complete = payload["complete"]
    let allow_market_data_api;
    if('market_data_api' in payload){
      allow_market_data_api = payload["market_data_api"];
    }else{
      allow_market_data_api = null
    }
    console.log(allow_market_data_api)
    let allow_home_page_api;
    if ('home_page_api' in payload) {
      allow_home_page_api = payload["home_page_api"];
    } else {
      allow_home_page_api = null
    }
    let allow_chart_1d_api;
    if ('chart_1d_api' in payload) {
      allow_chart_1d_api = payload["chart_1d_api"];
    } else {
      allow_chart_1d_api = null
    }
    let allow_chart_7d_api;
    if ('chart_7d_api' in payload) {
      allow_chart_7d_api = payload["chart_7d_api"];
    } else {
      allow_chart_7d_api = null
    }
    let allow_chart_30d_api;
    if ('chart_30d_api' in payload) {
      allow_chart_30d_api = payload["chart_30d_api"];
    } else {
      allow_chart_30d_api = null
    }
    let allow_chart_1y_api;
    if ('chart_1y_api' in payload) {
      allow_chart_1y_api = payload["chart_1y_api"];
    } else {
      allow_chart_1y_api = null
    }
    let allow_chart_all_api;
    if ('chart_all_api' in payload) {
      allow_chart_all_api = payload["chart_all_api"];
    } else {
      allow_chart_all_api = null
    }
    let allow_asset_data_api;
    if ('asset_data_api' in payload) {
      allow_asset_data_api = payload["asset_data_api"];
    } else {
      allow_asset_data_api = null
    }

    const dataKv = JSON.parse(await env.assetId.get('latestData'))

    let usd_1intreval
    let usd_5intreval
    let usd_15intreval
    let usd_60intreval
    let usd_10080intreval
    if(complete){
      usd_1intreval = JSON.parse(await env.assetId.get('usd_1'));
      usd_5intreval = JSON.parse(await env.assetId.get('usd_5'));
      usd_15intreval = JSON.parse(await env.assetId.get('usd_15'));
      usd_60intreval = JSON.parse(await env.assetId.get('usd_60'));
      usd_10080intreval = JSON.parse(await env.assetId.get('usd_10080'))
    }
    const assetKvData = JSON.parse(await env.assetId.get(slug, 'text'));
    let assetId
    if(assetKvData === null){
      assetId = await get_pair_info(slug)
      if(assetId == null){
        return new Response(JSON.stringify({ error: 'Asset Not there' }), {
          status: 400,
          headers: headers,
        });
      }
      await env.assetId.put(slug, JSON.stringify({assetId:assetId,itemId:payload.itemId,fullName:fullName}));
    }else{
      assetId = assetKvData.assetId
    }
    let usdData
    if(complete && usd_5intreval != null){
      usdData = await conversion_in_usd(null,null,5,true,complete,usd_5intreval)
    }else{
      usdData = await conversion_in_usd(null,null,5,true,complete)
    }

    let diluated_market_cap_ada;
    let diluated_market_cap_usd;
    let market_cap_ada;
    let market_cap_usd;
    let total_supply;
    let circulating_supply;
    if(allow_market_data_api === true){
      const market_data = await marketData(slug);
      console.log(market_data)
      if(!market_data || market_data.error){
        return new Response(JSON.stringify({ error: 'No market data available' }), {
          status: 400,
          headers: headers,
        });
      }
      diluated_market_cap_ada = market_data.fully_diluted_market_cap;
      console.log(diluated_market_cap_ada)
      market_cap_ada = market_data.market_cap;
      total_supply = market_data.total_supply;
      circulating_supply = market_data.circulating_supply;
      if(usdData){
        const latestUsdValue = usdData[usdData.length -1]
        const usdPrice = latestUsdValue[4]
        diluated_market_cap_usd = diluated_market_cap_ada * usdPrice;
        console.log(diluated_market_cap_usd)
        market_cap_usd = market_cap_ada * usdPrice;
      }
    }else{
      const slugData = dataKv.find(item => item.asset === slug);
    if(slugData){
      diluated_market_cap_ada = 'diluated_market_cap_ada' in slugData ? slugData['diluated_market_cap_ada'] : null;
      market_cap_ada = 'market_cap_ada' in slugData ? slugData['market_cap_ada'] : null;
      total_supply = 'total_supply' in slugData ? slugData['total_supply'] : null;
      circulating_supply = 'circulating_supply' in slugData ? slugData['circulating_supply'] : null;
      diluated_market_cap_usd = 'diluated_market_cap_usd' in slugData ? slugData['diluated_market_cap_usd'] : null;
      market_cap_usd = 'market_cap_usd' in slugData ? slugData['market_cap_usd'] : null;
    }else{
      diluated_market_cap_ada = null;
      market_cap_ada = null;
      total_supply = null;
      circulating_supply = null;
      diluated_market_cap_usd = null;
      market_cap_usd = null;
    }
  }
  let price_in_ada_close;
  let price_in_usd_close
  let percentage_24h;
  let percentage_24h_ada;
  let percentage_7d;
  let percentage_7d_ada;
  let percentage_1mo;
  let percentage_1mo_ada;
  let totalVol = 0
  let totalVolInADA = 0

  if(allow_home_page_api === true){


    const ohlc_data =await get_ohlc_data('1m',slug,false,false);
    if (!ohlc_data || ohlc_data.error) {
      return new Response(JSON.stringify({ error: 'No data available' }), {
        status: 400,
        headers: headers,
      });
    }
    const timestamp_str = ohlc_data[0]['timestamp'];
    const current_timestamp = new Date(timestamp_str);
    const target_timestamp_24h = new Date(current_timestamp);
    target_timestamp_24h.setHours(target_timestamp_24h.getHours() - 24);
    const data_24h = getTargetData(ohlc_data, target_timestamp_24h);
    const index_24h = data_24h.index
    let last24hVolumeData;
    if(index_24h !== -1){
      last24hVolumeData = ohlc_data.slice(0, index_24h+1);
    }
    const target_data_24h = data_24h.target_data
    price_in_ada_close = ohlc_data[0]['coin_a_close'];
    if(complete && usd_1intreval !== null){
      price_in_usd_close = await conversion_in_usd(price_in_ada_close,current_timestamp,1,false,complete,usd_1intreval);
    }else{
      price_in_usd_close = await conversion_in_usd(price_in_ada_close,current_timestamp,1,false,complete);
    }

    if(target_data_24h){
      const price_close_24h = price_in_usd_close;
      const price_open_24h = target_data_24h['coin_a_open'];
      const data_time_24h = new Date(target_data_24h['timestamp'])
      let price_open_24h_usd
      if(complete && usd_5intreval !== null){
        price_open_24h_usd = await conversion_in_usd(price_open_24h,data_time_24h,5,false,complete,usd_5intreval);
      }else{
        price_open_24h_usd = await conversion_in_usd(price_open_24h,data_time_24h,5,false,complete);
      }
      percentage_24h = calculatePercentageChange(price_close_24h, price_open_24h_usd);
      percentage_24h_ada = calculatePercentageChange(price_in_ada_close,price_open_24h)
    }else{
      percentage_24h = null
      percentage_24h_ada = null
    }
    if(percentage_24h === Infinity || Number.isNaN(percentage_24h)){
      percentage_24h = 0
    }
    if(percentage_24h_ada === Infinity || Number.isNaN(percentage_24h_ada)){
      percentage_24h_ada = 0
    }
    
    const target_timestamp_7d = new Date(current_timestamp);
    target_timestamp_7d.setDate(target_timestamp_7d.getDate() - 7);
    const data_7d = getTargetData(ohlc_data, target_timestamp_7d);
    const target_data_7d = data_7d.target_data

    if(target_data_7d){
      const price_close_7d = price_in_usd_close;
      const price_open_7d = target_data_7d['coin_a_open'];
      const data_time_7d = new Date(target_data_7d['timestamp'])
      let price_open_7d_usd
      if(complete && usd_15intreval !== null){
        price_open_7d_usd = await conversion_in_usd(price_open_7d,data_time_7d,15,false,complete,usd_15intreval);
      }else{
        price_open_7d_usd = await conversion_in_usd(price_open_7d,data_time_7d,15,false,complete);
      }
      percentage_7d = calculatePercentageChange(price_close_7d, price_open_7d_usd);
      percentage_7d_ada = calculatePercentageChange(price_in_ada_close,price_open_7d)
    }else{
      percentage_7d = null
      percentage_7d_ada = null
    }
    if(percentage_7d === Infinity || Number.isNaN(percentage_7d)){
      percentage_7d = 0
    }
    if(percentage_7d_ada === Infinity || Number.isNaN(percentage_7d_ada)){
      percentage_7d_ada = 0
    }
    const target_timestamp_1mo = new Date(current_timestamp);
    target_timestamp_1mo.setDate(target_timestamp_1mo.getDate() - 30);
    const data_1mo = getTargetData(ohlc_data, target_timestamp_1mo);
    const target_data_1mo = data_1mo.target_data

    if(target_data_1mo){
      const price_close_1mo = price_in_usd_close;
      const price_open_1mo = target_data_1mo['coin_a_open'];
      const data_time_1mo = new Date(target_data_1mo['timestamp'])
      let price_open_1mo_usd
      if(complete && usd_60intreval !== null){
        price_open_1mo_usd = await conversion_in_usd(price_open_1mo,data_time_1mo,60,false,complete,usd_60intreval);
      }else{
        price_open_1mo_usd = await conversion_in_usd(price_open_1mo,data_time_1mo,60,false,complete);
      }
      percentage_1mo = calculatePercentageChange(price_close_1mo, price_open_1mo_usd);
      percentage_1mo_ada = calculatePercentageChange(price_in_ada_close,price_open_1mo)
    }else{
      percentage_1mo = null
      percentage_1mo_ada = null
    }
    if(percentage_1mo === Infinity || Number.isNaN(percentage_1mo)){
      percentage_1mo = 0
    }
    if(percentage_1mo_ada === Infinity || Number.isNaN(percentage_1mo_ada)){
      percentage_1mo_ada = 0
    }


    if(last24hVolumeData){
      for (const data of last24hVolumeData){
        const vol = data['coin_a_volume']
        const date = new Date(data['timestamp'])
        // chart_ada_24h[date] = data['coin_a_close']
        // const closePriceInUsd = changeInUsd(data['coin_a_close'],usdData,date)
        // chart_usd_24h[date] = closePriceInUsd
        totalVolInADA += vol
        totalVol += changeInUsd(vol,usdData,date)
      }
    }else{
      totalVol = null
      totalVolInADA = null
      // chart_ada_24h = null
      // chart_usd_24h = null
    }
  }else{
    const slugData = dataKv.find(item => item.asset === slug);
    if(slugData){
      price_in_usd_close = 'price_in_usd' in slugData ? slugData['price_in_usd'] : null;
      price_in_ada_close = 'price_in_ada' in slugData ? slugData['price_in_ada'] : null;
      percentage_24h = '24h_change_usd' in slugData ? slugData['24h_change_usd'] : null;
      percentage_24h_ada = '24h_change_ada' in slugData ? slugData['24h_change_ada'] : null;
      percentage_7d = '7d_change_usd' in slugData ? slugData['7d_change_usd'] : null;
      percentage_7d_ada = '7d_change_ada' in slugData ? slugData['7d_change_ada'] : null;
      percentage_1mo = '1mo_change_usd' in slugData ? slugData['1mo_change_usd'] : null;
      percentage_1mo_ada = '1mo_change_ada' in slugData ? slugData['1mo_change_ada'] : null;
      totalVol = '24h_vol_usd' in slugData ? slugData['24h_vol_usd'] : null;
      totalVolInADA = '24h_vol_ada' in slugData ? slugData['24h_vol_ada'] : null;
    }else{
      price_in_usd_close = null;
      price_in_ada_close = null;
      percentage_24h = null;
      percentage_24h_ada = null;
      percentage_7d = null;
      percentage_7d_ada = null;
      percentage_1mo = null;
      percentage_1mo_ada = null;
      totalVol = null;
      totalVolInADA = null;
    }

    

  }
  let chart_ada_24h = {}
  let chart_usd_24h = {}
  if(allow_chart_1d_api === true){
    const dataFor24h = await get_ohlc_data('15m',slug,false,false)
    if (!dataFor24h || dataFor24h.error) {
      return new Response(JSON.stringify({ error: 'No data available' }), {
        status: 400,
        headers: headers,
      });
    }
    const timestamp_str = dataFor24h[0]['timestamp'];
    const current_timestamp = new Date(timestamp_str);
    const target_timestamp_24h = new Date(current_timestamp);
    target_timestamp_24h.setHours(target_timestamp_24h.getHours() - 24);
    const targetData24h = getTargetData(dataFor24h,target_timestamp_24h)
    if(targetData24h.target_data){
      const dataFor24hChart = dataFor24h.slice(0, targetData24h.index+1);
      for (const data of dataFor24hChart){
        const date = new Date(data['timestamp'])
        chart_ada_24h[date] = data['coin_a_close']
        const closePriceInUsd = changeInUsd(data['coin_a_close'],usdData,date)
        chart_usd_24h[date] = closePriceInUsd
      }
    }else{
      chart_ada_24h = null
      chart_usd_24h = null
    }
  }else{
    const slugData = dataKv.find(item => item.asset === slug);
    if(slugData){
    chart_ada_24h = 'chart_24h_ada' in slugData ? slugData['chart_24h_ada'] : null;
    chart_usd_24h = 'chart_24h_usd' in slugData ? slugData['chart_24h_usd'] : null;  
    }else{
      chart_ada_24h = null;
      chart_usd_24h = null;
    }

  
  }
  let chart_7d_ada = {}
  let chart_7d_usd = {}
  if(allow_chart_7d_api === true){

    let usdData7d
    if(complete && usd_15intreval !== null){
      usdData7d = await conversion_in_usd(null,null,15,true,complete,usd_15intreval);
    }else{
      usdData7d = await conversion_in_usd(null,null,15,true,complete);
    }
    const dataFor7d = await get_ohlc_data('1h',slug,false,false)
    if (!dataFor7d || dataFor7d.error) {
      return new Response(JSON.stringify({ error: 'No data available' }), {
        status: 400,
        headers: headers,
      });
    }
    const timestamp_str = dataFor7d[0]['timestamp'];
    const current_timestamp = new Date(timestamp_str);
    const target_timestamp_7d = new Date(current_timestamp);
    target_timestamp_7d.setDate(target_timestamp_7d.getDate() - 7);
    const targetData7d = getTargetData(dataFor7d,target_timestamp_7d)

    if(targetData7d.target_data){
      const dataFor7dChart = dataFor7d.slice(0, targetData7d.index+1);
      for (const data of dataFor7dChart){
        const date = new Date(data['timestamp'])
        chart_7d_ada[date] = data['coin_a_close']
        const closePriceInUsd = changeInUsd(data['coin_a_close'],usdData7d,date)
        chart_7d_usd[date] = closePriceInUsd
      }
    }else{
      chart_7d_ada = null
      chart_7d_usd = null
    }
  }else{
    const slugData = dataKv.find(item => item.asset === slug);
    if(slugData){
      chart_7d_ada = 'chart_7d_ada' in slugData ? slugData['chart_7d_ada'] : null;
      chart_7d_usd = 'chart_7d_usd' in slugData ? slugData['chart_7d_usd'] : null;    
    }else{
      chart_7d_ada = null;
      chart_7d_usd = null;
    }    
  }
  let chart_1mo_ada = {}
  let chart_1mo_usd = {}
  if(allow_chart_30d_api === true){

    let usdData1mo
    if(complete && usd_60intreval !== null){
      usdData1mo = await conversion_in_usd(null,null,60,true,complete,usd_60intreval);
    }else{
      usdData1mo = await conversion_in_usd(null,null,60,true,complete);
    }

    const dataFor1mo = await get_ohlc_data('1d',slug,false,false)
    if (!dataFor1mo || dataFor1mo.error) {
      return new Response(JSON.stringify({ error: 'No data available' }), {
        status: 400,
        headers: headers,
      });
    }
    const timestamp_str = dataFor1mo[0]['timestamp'];
    const current_timestamp = new Date(timestamp_str);
    const target_timestamp_1mo = new Date(current_timestamp);
    target_timestamp_1mo.setDate(target_timestamp_1mo.getDate() - 30);
    const targetData1mo = getTargetData(dataFor1mo,target_timestamp_1mo)

    if(targetData1mo.target_data){
      const dataFor1moChart = dataFor1mo.slice(0, targetData1mo.index+1);    

      for (const data of dataFor1moChart){
        const date = new Date(data['timestamp'])
        chart_1mo_ada[date] = data['coin_a_close']
        const closePriceInUsd = changeInUsd(data['coin_a_close'],usdData1mo,date)
        chart_1mo_usd[date] = closePriceInUsd
      }
    }else{
      chart_1mo_ada = null
      chart_1mo_usd = null
    }
  }else{
    const slugData = dataKv.find(item => item.asset === slug);
    if(slugData){
      chart_1mo_ada = 'chart_1mo_ada' in slugData ? slugData['chart_1mo_ada'] : null;
      chart_1mo_usd = 'chart_1mo_usd' in slugData ? slugData['chart_1mo_usd'] : null;
    }else{
      chart_1mo_ada = null;
      chart_1mo_usd = null;
    }
    
  }
  let chart_1y_ada = {}
  let chart_1y_usd = {}
  let percentage_1y_ada;
  let percentage_1y_usd;
  let usdData1y
  if(complete && usd_10080intreval !== null){
    usdData1y = await conversion_in_usd(null,null,10080,true,complete,usd_10080intreval);
  }else{
    usdData1y = await conversion_in_usd(null,null,10080,true,complete);
  }
  if(allow_chart_1y_api === true){

    const dataFor1yChart = await get_ohlc_data('1w',slug,true,false)
    if (!dataFor1yChart || dataFor1yChart.error) {
      return new Response(JSON.stringify({ error: 'No data available' }), {
        status: 400,
        headers: headers,
      });
    }
    let initial_1y_price_ada
    let initial_1y_price_usd
    let final_1y_price_ada
    let final_1y_price_usd
    let index1Y = 0
    for (const data of dataFor1yChart){
      const date = new Date(data['timestamp'])
      chart_1y_ada[date] = data['coin_a_close']
      const closePriceInUsd = changeInUsd(data['coin_a_close'],usdData1y,date)
      chart_1y_usd[date] = closePriceInUsd
      const finalIndex1Y = dataFor1yChart.length - 1
      if(index1Y === 0){
        initial_1y_price_ada = data['coin_a_close']
        initial_1y_price_usd = closePriceInUsd
      }else if(index1Y === finalIndex1Y){
        final_1y_price_ada = data['coin_a_close']
        final_1y_price_usd = closePriceInUsd
      }
      index1Y += 1
    }
    percentage_1y_ada = calculatePercentageChange(final_1y_price_ada,initial_1y_price_ada)
    percentage_1y_usd = calculatePercentageChange(final_1y_price_usd,initial_1y_price_usd)
  }else{
    const slugData = dataKv.find(item => item.asset === slug);
    if(slugData){
      percentage_1y_ada = 'percentage_1y_ada' in slugData ? slugData['percentage_1y_ada'] : null;
      percentage_1y_usd = 'percentage_1y_usd' in slugData ? slugData['percentage_1y_usd'] : null;
      chart_1y_ada = 'chart_1y_ada' in slugData ? slugData['chart_1y_ada'] : null;
      chart_1y_usd = 'chart_1y_usd' in slugData ? slugData['chart_1y_usd'] : null;
    }else{
      percentage_1y_ada = null;
      percentage_1y_usd = null;
      chart_1y_ada = null;
      chart_1y_usd = null;
    }

    
  }
  let decimals
  let createdDate
  let holdersData
  // let total_supply
  if(allow_asset_data_api === true){

  const assetInfo = await getAssetData(assetId);
  if (!assetInfo || assetInfo.error) {
    return new Response(JSON.stringify({ error: 'No data available' }), {
      status: 400,
      headers: headers,
    });
  }
  const assetData = assetInfo['data']
    const uniqueData = assetData['unique_holders']
    holdersData = uniqueData['by_account']
    const mintTx = assetData['first_mint_tx']
    createdDate = mintTx['timestamp']
    const tokenMetadata = assetData['token_registry_metadata'];
    // total_supply = assetData['total_supply']
    if(tokenMetadata !== null){
      decimals = tokenMetadata['decimals']
    }
  }else{
    const slugData = dataKv.find(item => item.asset === slug);
    if(slugData){
      decimals = 'decimals' in slugData ? slugData['decimals'] : null;
      createdDate = 'created_date' in slugData ? slugData['created_date'] : null;
      holdersData = 'holders' in slugData ? slugData['holders'] : null;
      // total_supply = 'total_supply' in slugData ? slugData['total_supply'] : null;  
    }else{
      decimals = null;
      createdDate = null;
      holdersData = null;
      // total_supply = null;
    }
   
  }
    let chart_all_ada = {}
    let chart_all_usd = {}
    let percentage_all_ada;
    let percentage_all_usd;
    if(allow_chart_all_api === true){

    let datePart
    if(createdDate){
      datePart = createdDate.split(' ')[0];
    }else{
      datePart = '2023-04-01'
    }
    const dataForAllChart = await get_ohlc_data('1mo',slug,false,true,datePart)
    if (!dataForAllChart || dataForAllChart.error) {
      return new Response(JSON.stringify({ error: 'No data available' }), {
        status: 400,
        headers: headers,
      });
    }
    let initial_all_price_ada
    let initial_all_price_usd
    let final_all_price_ada
    let final_all_price_usd
    const finalIndexAll = dataForAllChart.length -1
    let indexAll = 0
    for (const data of dataForAllChart){
      const date = new Date(data['timestamp'])
      chart_all_ada[date] = data['coin_a_close']
      const closePriceInUsd = changeInUsd(data['coin_a_close'],usdData1y,date)
      chart_all_usd[date] = closePriceInUsd
      if(indexAll === 0){
        initial_all_price_ada = data['coin_a_close']
        initial_all_price_usd = closePriceInUsd
      }else if(indexAll === finalIndexAll){
        final_all_price_ada = data['coin_a_close']
        final_all_price_usd = closePriceInUsd
      }
      indexAll += 1
    }
    percentage_all_ada = calculatePercentageChange(final_all_price_ada,initial_all_price_ada)
    percentage_all_usd = calculatePercentageChange(final_all_price_usd,initial_all_price_usd)
  }else{
    const slugData = dataKv.find(item => item.asset === slug);
    if(slugData){
      chart_all_ada = 'chart_all_ada' in slugData ? slugData['chart_all_ada'] : null;
      chart_all_usd = 'chart_all_usd' in slugData ? slugData['chart_all_usd'] : null;
      percentage_all_ada = 'percentage_all_change_ada' in slugData ? slugData['percentage_all_change_ada'] : null;
      percentage_all_usd = 'percentage_all_change_usd' in slugData ? slugData['percentage_all_change_usd'] : null;    
    }else{
      chart_all_ada = null;
      chart_all_usd = null;
      percentage_all_ada = null;
      percentage_all_usd = null;    
    }

  }

    let usdPrice
    if(price_in_usd_close === 0){
      usdPrice = 0
    }else{
      usdPrice = 1/price_in_usd_close
    }
    console.log(usdPrice);
    console.log('completed');
    // console.log({'price':price_in_usd_close,'24h_change':percentage_24h,'7d_change':percentage_7d,'1mo_change':percentage_1mo,'24h_vol': totalVol,'graph_data_7d': last7dData,'total_supply':assetData['total_supply'],'holders':holdersData['by_account'],'created_date':createdDate['timestamp']})
    const responseBody = JSON.stringify({'asset':slug,
    'price_in_usd':price_in_usd_close,
    'price_in_ada':price_in_ada_close,
    '24h_change_usd':percentage_24h,
    '7d_change_usd':percentage_7d,
    '1mo_change_usd':percentage_1mo,
    '24h_change_ada':percentage_24h_ada,
    '7d_change_ada':percentage_7d_ada,
    '1mo_change_ada':percentage_1mo_ada,
     '24h_vol_usd': totalVol,
     '24h_vol_ada':totalVolInADA,
     'total_supply':total_supply,
     'diluated_market_cap_ada': diluated_market_cap_ada,
     'diluated_market_cap_usd': diluated_market_cap_usd,
     'market_cap_ada': market_cap_ada,
     'market_cap_usd': market_cap_usd,
     'circulating_supply': circulating_supply,
     'holders':holdersData,
     'created_date':createdDate,
     'asset_id':assetId,
     '1USD':usdPrice,
     'chart_24h_ada':chart_ada_24h,
     'chart_24h_usd':chart_usd_24h,
     'chart_7d_ada':chart_7d_ada,
     'chart_7d_usd':chart_7d_usd,
     'chart_1mo_ada':chart_1mo_ada,
     'chart_1mo_usd':chart_1mo_usd,
     'chart_1y_ada':chart_1y_ada,
     'chart_1y_usd':chart_1y_usd,
     'chart_all_ada':chart_all_ada,
     'chart_all_usd':chart_all_usd,
     'percentage_all_change_ada':percentage_all_ada,
     'percentage_all_change_usd':percentage_all_usd,
     'percentage_1y_ada':percentage_1y_ada,
     'percentage_1y_usd':percentage_1y_usd,
     'decimals':decimals,
     'fullName':fullName});
      

    return new Response(responseBody, { status: 200, headers });
  },
};
