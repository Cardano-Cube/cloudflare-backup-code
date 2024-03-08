/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
// async function getSlugData(slug) {
//   const apiUrl = 'https://asset-data.milan-houter.workers.dev/';

//   const postBody = JSON.stringify({
//     "slug": slug
//   });

//   const response = await fetch(apiUrl, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: postBody,
//   });
//   // console.log(await response.json());
//   const responseData = await response.json();
//   console.log(responseData);

// }
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function rankData(data) {
  const updatedData = data.sort((a, b) => b['24h_change_usd'] - a['24h_change_usd']);
  updatedData.forEach((item, index) => {
    item['top_gainer'] = {
      rank: index + 1,
    };
  });
  return updatedData
}

function rankTopLosers(data, ascending = true) {
  const updatedData = data.sort((a, b) => (ascending ? 1 : -1) * (a['24h_change_usd'] - b['24h_change_usd']));

  updatedData.forEach((item, index) => {
    item['top_loser'] = {
      rank: index + 1,
    };
  });
  return updatedData
}
function rankByVolume(data, key) {
  const updatedData = data.sort((a, b) => b['24h_vol_usd'] - a['24h_vol_usd'])

  updatedData.forEach((item, index) => {
    item[key] = {
      rank: index + 1,
    };
  });
  return updatedData
}
function rankByMarketCap(data, key) {
  const updatedData = data.sort((a, b) => b['market_cap_usd'] - a['market_cap_usd'])

  updatedData.forEach((item, index) => {
    item[key] = {
      rank: index + 1,
    };
  });
  return updatedData
}

function rankAllData(data) {
  const gainer = rankData(data);
  const trending = rankByVolume(gainer, 'trending');
  const loser_data = rankTopLosers(trending);
  const top_tokens = rankByMarketCap(loser_data, 'top_tokens');

  return top_tokens;
}
export default {
  async fetch(request, env, ctx) {
    
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers });
    }
    const body = await request.text();
    console.log(body);
    if(body){
      const data = JSON.parse(body);
      // const data = JSON.parse(dataBody)
      console.log(data);
      // console.log(typeof(data));
      // console.log(env.collectionId);
      // console.log(data.payload.collectionId);
      // console.log(data['triggerType'] === 'collection_item_created');
      if(data['triggerType'] === 'collection_item_created' && data.payload.collectionId === env.collectionId){
        const slug = data.payload.fieldData['short-name-api'];
        const fullName = data.payload.fieldData['name'];
        console.log(fullName);
        const itemId = data.payload.id
        const slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
          body: JSON.stringify({slug:slug,itemId:itemId,fullName:fullName,complete:false,'home_page_api':true,'chart_1d_api':true,'chart_7d_api':true,'chart_30d_api':true,'chart_1y_api':true,'chart_all_api':true,'asset_data_api':true,'market_data_api':true}),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }))
        if(slugData.ok){
          const data = await slugData.json();
          let final_data
          const kvData = await env.assetId.get('latestData')
          let kvDataArr = JSON.parse(kvData)
          if(kvData){
            kvDataArr.push(data)
            final_data = rankAllData(kvDataArr)
            await env.assetId.put('latestData',JSON.stringify(final_data))
          }else{
            final_data = data
            const dataArr = [final_data]
            await env.assetId.put('latestData',JSON.stringify(dataArr))
          }
          return new Response(final_data, { status: 200, headers });
        }else {
          return new Response(JSON.stringify({ error: slugData.statusText }), {
            status: 400,
            headers: headers,
          });
        }
      }else if(data['triggerType'] === 'collection_item_deleted' && data.payload.collectionId === env.collectionId){
        const itemId = data.payload.id;
        const allItems = await env.assetId.list();
        for (const key of allItems.keys){

          if(key['name'] === 'latestData' || key['name'] === 'usd_1' || key['name'] === 'usd_5' || key['name'] === 'usd_15' || key['name'] === 'usd_60' || key['name'] === 'usd_10080'){
            continue
          }
          const data = await env.assetId.get(key['name'])

          const assetKv = JSON.parse(data)
          if(assetKv?.itemId === itemId){
            await env.assetId.delete(key['name'])
            let final_data
            const kvData = await env.assetId.get('latestData')
            let kvDataArr = JSON.parse(kvData)
            if(kvData){
              const kvDataArrUpdated = kvDataArr.filter(item => item.asset !== key['name']);
              final_data = rankAllData(kvDataArrUpdated)
              await env.assetId.put('latestData',JSON.stringify(final_data))
            }else{
              final_data = data
            }
            

          return new Response(final_data, { status: 200, headers }); 
          }
        }
    }else if(data['triggerType'] === 'collection_item_changed' && data.payload.collectionId === env.collectionId){

      const itemId = data.payload.id;
      const slug = data.payload.fieldData['short-name-api'];
      console.log(slug);
      const fullName = data.payload.fieldData['name'];
      const allItems = await env.assetId.list();
      console.log(allItems);
      let check = 0
      for (const key of allItems.keys){

        if(key['name'] === 'latestData' || key['name'] === 'usd_1' || key['name'] === 'usd_5' || key['name'] === 'usd_15' || key['name'] === 'usd_60' || key['name'] === 'usd_10080'){
          continue
        }
        const data = await env.assetId.get(key['name'])
        console.log(data);
        const assetKv = JSON.parse(data)
        if(assetKv?.itemId === itemId){
          check = 1
          console.log(key['name']);
          if(slug === null || slug !== key['name']){
            await env.assetId.delete(key['name'])
            let final_data
            const kvData = await env.assetId.get('latestData')
            console.log(kvData);
            let kvDataArr = JSON.parse(kvData)
            if(kvData){
              const kvDataArrUpdated = kvDataArr.filter(item => item.asset !== key['name']);
              final_data = rankAllData(kvDataArrUpdated)
              await env.assetId.put('latestData',JSON.stringify(final_data))
            }
            if(slug !== null && slug !== key['name']){
              const slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
                body: JSON.stringify({slug:slug,itemId:itemId,fullName:fullName,complete:false,'home_page_api':true,'chart_1d_api':true,'chart_7d_api':true,'chart_30d_api':true,'chart_1y_api':true,'chart_all_api':true,'asset_data_api':true,'market_data_api':true}),
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
              }))
              console.log(slugData);
              if(slugData.ok){
                const data = await slugData.json();
                let final_data
                const kvData = await env.assetId.get('latestData')
                let kvDataArr = JSON.parse(kvData)
                if(kvData){
                  kvDataArr.push(data)
                  final_data = rankAllData(kvDataArr)
                  await env.assetId.put('latestData',JSON.stringify(final_data))
                }else{
                  final_data = data
                  const dataArr = [final_data]
                  await env.assetId.put('latestData',JSON.stringify(dataArr))
                }
                return new Response(final_data, { status: 200, headers });
              }else {
                return new Response(JSON.stringify({ error: slugData.statusText }), {
                  status: 400,
                  headers: headers,
                });
              }
            }
          }
          break
        }
      }
      if(check === 0 && slug !== null){
          const slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
              body: JSON.stringify({slug:slug,itemId:itemId,fullName:fullName,complete:false,'home_page_api':true,'chart_1d_api':true,'chart_7d_api':true,'chart_30d_api':true,'chart_1y_api':true,'chart_all_api':true,'asset_data_api':true,'market_data_api':true}),
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
              }))
              console.log(slugData);
              if(slugData.ok){
                const data = await slugData.json();
                let final_data
                const kvData = await env.assetId.get('latestData')
                let kvDataArr = JSON.parse(kvData)
                if(kvData){
                  kvDataArr.push(data)
                  final_data = rankAllData(kvDataArr)
                  await env.assetId.put('latestData',JSON.stringify(final_data))
                }else{
                  final_data = data
                  const dataArr = [final_data]
                  await env.assetId.put('latestData',JSON.stringify(dataArr))
                }
                return new Response(final_data, { status: 200, headers });
              }else {
                return new Response(JSON.stringify({ error: slugData.statusText }), {
                  status: 400,
                  headers: headers,
                });
              }
        }
    }
    else if(data['triggerType'] === 'latest_data'){
      const dataKv = await env.assetId.get('latestData')
      return new Response(dataKv, {
        status: 200,
        headers: headers,
      }); 
    }else if(data['triggerType'] === 'individual_data'){
      const asset = data['asset']
      const dataKv = await env.assetId.get('latestData');
      const parsedData = JSON.parse(dataKv)
      const matchingObject = parsedData.find(item => item.asset === asset);
      if (matchingObject) {
        return new Response(JSON.stringify(matchingObject), {
          status: 200,
          headers: headers,
        }); 
      } else {
        return new Response("No Data Found", {
          status: 400,
          headers: headers,
        }); 
      }

    }
    else if(data['triggerType'] === 'update_all'){
      const allItems = await env.assetId.list();
      const interval = [1,5,15,60,10080]
      for (const i of interval){
        const api_url = `https://api.kraken.com/0/public/OHLC?pair=ADAUSD&since=0&interval=${i}`;
  
        const response = await fetch(api_url);
        const data = await response.json();
        await env.assetId.put(`usd_${i}`,JSON.stringify(data))
      }
      let assetData = []
      for (const key of allItems.keys) {
        
        const asset = key['name'];
        console.log(asset);
        const assetInfo = JSON.parse(await env.assetId.get(asset));
        const fullName = assetInfo.fullName;
        if (asset != "latestData" && asset != "usd_1" && asset != "usd_5" && asset != "usd_15" && asset != "usd_60" && asset != "usd_10080") {
          let slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
            body: JSON.stringify({ slug: asset, fullName: fullName, complete: true, 'market_data_api':true }),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        }));
        if(await slugData.status === 200 ){
          const data = await slugData.json();
          if (data != '' && data != null) {
              assetData.push(data);
          }
        }

        }
    }
    const final_data = rankAllData(assetData)
    await env.assetId.put('latestData',JSON.stringify(final_data))
    return new Response(JSON.stringify(final_data), {
      status: 200,
      headers: headers,
    }); 
  }
  }
  },

  async scheduled(event, env, ctx) {

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const home_page_time = parseInt(await env.tracker.get('home_page_time'));
    const chart_1d_time = parseInt(await env.tracker.get('chart_1d_time'));
    const chart_7d_time = parseInt(await env.tracker.get('chart_7d_time'));
    const chart_30d_time = parseInt(await env.tracker.get('chart_30d_time'));
    const chart_1y_time = parseInt(await env.tracker.get('chart_1y_time'));
    const chart_all_time = parseInt(await env.tracker.get('chart_all_time'));
    const asset_data_time = parseInt(await env.tracker.get('asset_data_time'));
    const market_data_time = parseInt(await env.tracker.get('market_data_time'));
    console.log(home_page_time);
    console.log(chart_1d_time);
    const home_page_tracker = parseInt(await env.tracker.get('home_page_tracker')) + 1;
    console.log(home_page_tracker);
    const chart_1d_tracker = parseInt(await env.tracker.get('chart_1d_tracker')) + 1;
    console.log(chart_1d_tracker);
    const chart_7d_tracker = parseInt(await env.tracker.get('chart_7d_tracker')) + 1;
    const chart_30d_tracker = parseInt(await env.tracker.get('chart_30d_tracker')) + 1;
    const chart_1y_tracker = parseInt(await env.tracker.get('chart_1y_tracker')) + 1;
    const chart_all_tracker = parseInt(await env.tracker.get('chart_all_tracker')) + 1;
    const asset_data_tracker = parseInt(await env.tracker.get('asset_data_tracker')) + 1;
    const market_data_tracker = parseInt(await env.tracker.get('market_data_tracker')) + 1;

    const allItems = await env.assetId.list();
    const interval = [1,5,15,60,10080]
    for (const i of interval){
      const api_url = `https://api.kraken.com/0/public/OHLC?pair=ADAUSD&since=0&interval=${i}`;

      const response = await fetch(api_url);
      const data = await response.json();
      await env.assetId.put(`usd_${i}`,JSON.stringify(data))
    }    
    let checkHomePage = 0;
    let checkChart1d = 0;
    let checkChart7d = 0;
    let checkChart30d = 0;
    let checkChart1y = 0;
    let checkChartAll = 0;
    let checkAssetData = 0;
    let checkMarketData = 0;
  //   if (market_data_time <= market_data_tracker) {
  //     let assetData = []
  //     for (const key of allItems.keys) {
  //         const asset = key['name'];
  //         const assetInfo = JSON.parse(await env.assetId.get(asset));
  //         const fullName = assetInfo.fullName;
  //         // console.log(fullName);
  
  //         if (asset != "latestData" && asset != "usd_1" && asset != "usd_5" && asset != "usd_15" && asset != "usd_60" && asset != "usd_10080") {
  //           let slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
  //             body: JSON.stringify({ slug: asset, fullName: fullName, complete: true, 'market_data_api': true }),
  //             method: 'POST',
  //             headers: {
  //                 'Content-Type': 'application/json',
  //             },
  //         }));
  //         if(await slugData.status === 200 ){
  //           const data = await slugData.json();
  //           if (data != '' && data != null) {
  //               assetData.push(data);
  //           }
  //         }

  //         }
  //     }
  //     console.log(assetData.length);
  //     console.log(assetData[0]);
  //     checkMarketData = 1
  //     // await env.tracker.put('home_page_tracker','0');
  //     const final_data = rankAllData(assetData)
  //     await env.assetId.put('latestData',JSON.stringify(final_data))
  // }
      if (home_page_time <= home_page_tracker) {
        let assetData = []
        for (const key of allItems.keys) {
            const asset = key['name'];
            const assetInfo = JSON.parse(await env.assetId.get(asset));
            const fullName = assetInfo.fullName;
            // console.log(fullName);
    
            if (asset != "latestData" && asset != "usd_1" && asset != "usd_5" && asset != "usd_15" && asset != "usd_60" && asset != "usd_10080") {
              let slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
                body: JSON.stringify({ slug: asset, fullName: fullName, complete: true, 'home_page_api': true }),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            }));
            if(await slugData.status === 200 ){
              const data = await slugData.json();
              if (data != '' && data != null) {
                  assetData.push(data);
              }
            }

            }
        }
        console.log(assetData.length);
        console.log(assetData[0]);
        checkHomePage = 1
        // await env.tracker.put('home_page_tracker','0');
        const final_data = rankAllData(assetData)
        await env.assetId.put('latestData',JSON.stringify(final_data))
    }
    // else{
    //   await env.tracker.put('home_page_tracker',JSON.stringify(home_page_tracker));
    // }
    if (chart_1d_time <= chart_1d_tracker) {
      let assetData = [];
      for (const key of allItems.keys) {
          const asset = key['name'];
          const assetInfo = JSON.parse(await env.assetId.get(asset));
          const fullName = assetInfo.fullName;
          // console.log(fullName);
  
          if (asset != "latestData" && asset != "usd_1" && asset != "usd_5" && asset != "usd_15" && asset != "usd_60" && asset != "usd_10080") {
              let slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
                  body: JSON.stringify({ slug: asset, fullName: fullName, complete: true, 'chart_1d_api': true }),
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                  },
              }));
              if(await slugData.status === 200 ){
                const data = await slugData.json();
                if (data != '' && data != null) {
                    assetData.push(data);
                }
              }
          }
      }
      
      const final_data = rankAllData(assetData);
      checkChart1d = 1
      await env.assetId.put('latestData',JSON.stringify(final_data))
      // await env.tracker.put('chart_1d_tracker','0');
  }
  // else{
  //   await env.tracker.put('chart_1d_tracker',JSON.stringify(chart_1d_tracker));
  // }
  if (chart_7d_time <= chart_7d_tracker) {
    let assetData = [];
    for (const key of allItems.keys) {
        const asset = key['name'];
        const assetInfo = JSON.parse(await env.assetId.get(asset));
        const fullName = assetInfo.fullName;
        console.log(fullName);

        if (asset != "latestData" && asset != "usd_1" && asset != "usd_5" && asset != "usd_15" && asset != "usd_60" && asset != "usd_10080") {
            let slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
                body: JSON.stringify({ slug: asset, fullName: fullName, complete: true, 'chart_7d_api': true }),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            }));
            if(await slugData.status === 200 ){
              const data = await slugData.json();
              if (data != '' && data != null) {
                  assetData.push(data);
              }
            }
        }
    }
    // await env.tracker.put('chart_7d_tracker','0');
    checkChart7d = 1;
    const final_data = rankAllData(assetData);
    await env.assetId.put('latestData',JSON.stringify(final_data))
}
// else{
//   await env.tracker.put('chart_7d_tracker',JSON.stringify(chart_7d_tracker));
// }

if (chart_30d_time <= chart_30d_tracker) {
    let assetData = [];
    for (const key of allItems.keys) {
        const asset = key['name'];
        const assetInfo = JSON.parse(await env.assetId.get(asset));
        const fullName = assetInfo.fullName;
        console.log(fullName);

        if (asset != "latestData" && asset != "usd_1" && asset != "usd_5" && asset != "usd_15" && asset != "usd_60" && asset != "usd_10080") {
            let slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
                body: JSON.stringify({ slug: asset, fullName: fullName, complete: true, 'chart_30d_api': true }),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            }));
            if(await slugData.status === 200 ){
              const data = await slugData.json();
              if (data != '' && data != null) {
                  assetData.push(data);
              }
            }
        }
    }
    const final_data = rankAllData(assetData);
    checkChart30d = 1
    await env.assetId.put('latestData',JSON.stringify(final_data))
    // await env.tracker.put('chart_30d_tracker','0');

}
// else{
//   await env.tracker.put('chart_30d_tracker',JSON.stringify(chart_30d_tracker));
// }

if (chart_1y_time <= chart_1y_tracker) {
  let assetData = [];
  for (const key of allItems.keys) {
      const asset = key['name'];
      const assetInfo = JSON.parse(await env.assetId.get(asset));
      const fullName = assetInfo.fullName;
      console.log(fullName);

      if (asset != "latestData" && asset != "usd_1" && asset != "usd_5" && asset != "usd_15" && asset != "usd_60" && asset != "usd_10080") {
          let slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
              body: JSON.stringify({ slug: asset, fullName: fullName, complete: true, 'chart_1y_api': true }),
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
          }));
          if(await slugData.status === 200 ){
            const data = await slugData.json();
            if (data != '' && data != null) {
                assetData.push(data);
            }
          }
      }
  }
  const final_data = rankAllData(assetData);
  checkChart1y = 1
  await env.assetId.put('latestData',JSON.stringify(final_data))
  // await env.tracker.put('chart_1y_tracker','0');

}
// else{
//   await env.tracker.put('chart_1y_tracker',JSON.stringify(chart_1y_tracker));
// }

if (chart_all_time <= chart_all_tracker) {
  let assetData = [];
  for (const key of allItems.keys) {
      const asset = key['name'];
      const assetInfo = JSON.parse(await env.assetId.get(asset));
      const fullName = assetInfo.fullName;
      console.log(fullName);

      if (asset != "latestData" && asset != "usd_1" && asset != "usd_5" && asset != "usd_15" && asset != "usd_60" && asset != "usd_10080") {
          let slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
              body: JSON.stringify({ slug: asset, fullName: fullName, complete: true, 'chart_all_api': true }),
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
          }));
          if(await slugData.status === 200 ){
            const data = await slugData.json();
            if (data != '' && data != null) {
                assetData.push(data);
            }
          }
      }
  }
  // await env.tracker.put('chart_all_tracker','0');
  checkChartAll = 1
  const final_data = rankAllData(assetData);
  await env.assetId.put('latestData',JSON.stringify(final_data))
}
// else{
//   await env.tracker.put('chart_all_tracker',JSON.stringify(chart_all_tracker));
// }

if (asset_data_time <= asset_data_tracker) {
  let assetData = [];
  for (const key of allItems.keys) {
      const asset = key['name'];
      const assetInfo = JSON.parse(await env.assetId.get(asset));
      const fullName = assetInfo.fullName;
      console.log(fullName);

      if (asset != "latestData" && asset != "usd_1" && asset != "usd_5" && asset != "usd_15" && asset != "usd_60" && asset != "usd_10080") {
          let slugData = await env.assetData.fetch(new Request('https://asset-data.milan-houter.workers.dev/', {
              body: JSON.stringify({ slug: asset, fullName: fullName, complete: true, 'asset_data_api': true }),
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
          }));
          if(await slugData.status === 200 ){
            const data = await slugData.json();
            if (data != '' && data != null) {
                assetData.push(data);
            }
          }
      }
  }
  // await env.tracker.put('asset_data_tracker','0');
  checkAssetData = 1
  const final_data = rankAllData(assetData);
  await env.assetId.put('latestData',JSON.stringify(final_data))
}
// else{
//   await env.tracker.put('asset_data_tracker',JSON.stringify(asset_data_tracker));
// }
if(checkMarketData === 0){
  await env.tracker.put('market_data_tracker',JSON.stringify(market_data_tracker));
}else{
  await env.tracker.put('market_data_tracker','0');
}
if(checkHomePage === 0){
  await env.tracker.put('home_page_tracker',JSON.stringify(home_page_tracker));
}else{
  await env.tracker.put('home_page_tracker','0');
}
if(checkChart1d === 0){
  await env.tracker.put('chart_1d_tracker',JSON.stringify(chart_1d_tracker));
}else{
  await env.tracker.put('chart_1d_tracker','0');
}
if(checkChart7d === 0){
  await env.tracker.put('chart_7d_tracker',JSON.stringify(chart_7d_tracker));
}else{
  await env.tracker.put('chart_7d_tracker','0');
}
if(checkChart30d === 0){
  await env.tracker.put('chart_30d_tracker',JSON.stringify(chart_30d_tracker));
}else{
  await env.tracker.put('chart_30d_tracker','0');
}
if(checkChart1y === 0){
  await env.tracker.put('chart_1y_tracker',JSON.stringify(chart_1y_tracker));
}else{
  await env.tracker.put('chart_1y_tracker','0');
}
if(checkChartAll === 0){
  await env.tracker.put('chart_all_tracker',JSON.stringify(chart_all_tracker));
}else{
  await env.tracker.put('chart_all_tracker','0');
}
if(checkAssetData === 0){
  await env.tracker.put('asset_data_tracker',JSON.stringify(asset_data_tracker));
}else{
  await env.tracker.put('asset_data_tracker','0');
}   

    // for (const i of interval){
    //   await env.assetId.delete(`usd_${i}`)
    // }

    return new Response('Data Updated', {
      status: 200,
      headers: headers,
    }); 
  },
};