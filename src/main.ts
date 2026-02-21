// https://pusatdata.kontan.co.id/market/chart_logam_mulia/?startdate={date}&enddate={date}&logam=gold
// https://pusatdata.kontan.co.id/market/chart_logam_mulia/?startdate={date}&enddate={date}&logam=silver
// date format: [YYYY]-[MM]-[DD]

import * as cheerio from 'cheerio'
import dayjs from 'dayjs'
import admin from 'firebase-admin'
import cred from '../secret/service.json' with { type: 'json' }

admin.initializeApp({
  credential: admin.credential.cert(cred as admin.ServiceAccount),
  databaseURL: "https://sold-goldman-default-rtdb.asia-southeast1.firebasedatabase.app/"
})

const db = admin.database()

type ScrapeResult = {
  captured_at: string,
  buyback: {
    date: string,
    price: number
  }, sell: {
    date: string,
    price: number
  }
}

type DBCompliantFormat = {
  captured_at: string,
  gold: {
    buyback: {
      last_update: string,
      price: number
    },
    sell: {
      last_update: string,
      price: number
    }
  },
  silver: {
    buyback: {
      last_update: string,
      price: number
    },
    sell: {
      last_update: string,
      price: number
    }
  }
}

type DBCompliantExtendedFormat = {
  captured_at: string,
  gold: {
    buyback: {
      last_update: string,
      price: number
    },
    sell: {
      last_update: string,
      price: number
    },
    difference: {
      last_update: string,
      price: number
    },
    change: {
      last_update: string,
      price: number
    },
    sign: {
      last_update: string,
      price: number
    }
  },
  silver: {
    buyback: {
      last_update: string,
      price: number
    },
    sell: {
      last_update: string,
      price: number
    },
    difference: {
      last_update: string,
      price: number
    },
    change: {
      last_update: string,
      price: number
    },
    sign: {
      last_update: string,
      price: number
    }
  }
}

async function scrape(metal: "silver" | "gold", date = new Date()) {
  const captured_at = date.toISOString()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const day = (date.getDate()).toString().padStart(2, "0")
  const now = `${date.getFullYear()}-${month}-${day}`
  const req = await fetch(`https://pusatdata.kontan.co.id/market/chart_logam_mulia/?startdate=${now}&enddate=${now}&logam=${metal}`)
  const $ = cheerio.load(await req.text())

  const result: ScrapeResult = {
    captured_at,
    buyback: {
      date: '-1',
      price: -1
    },
    sell: {
      date: '',
      price: -1
    }
  }
  const scrapeDateRaw = $('.kol-konten3-1').first().text().trim().split('/')
  // scrapeDateRaw[1] = (parseInt(scrapeDateRaw[1] as string) + 1).toString().padStart(2, '0')
  const temp = scrapeDateRaw[0] as string
  scrapeDateRaw[0] = scrapeDateRaw[1] as string
  scrapeDateRaw[1] = temp
  const scrapeDate = scrapeDateRaw.join('/')
  $(".kol-konten3-3").each((_, el) => {
    const text = $(el).text().trim()
    const num = parseInt(text.replace(/[^\d]/g, ""))
    if (metal == "silver") {
      result.sell.price = num
      result.sell.date = dayjs(scrapeDate).format()
    }
    if (metal == "gold") {
      result[_ == 0 ? "buyback" : "sell"].price = num
      result[_ == 0 ? "buyback" : "sell"].date = dayjs(scrapeDate).format()
    }
  })
  return result
}

async function scrapeAndFormatAll() {
  return format(await scrape('gold'), await scrape('silver'))
}

function format(goldData: ScrapeResult, silverData: ScrapeResult): DBCompliantFormat {
  return {
    captured_at: goldData.captured_at,
    gold: {
      buyback: {
        last_update: goldData.buyback.date,
        price: goldData.buyback.price
      },
      sell: {
        last_update: goldData.sell.date,
        price: goldData.sell.price
      }
    },
    silver: {
      buyback: {
        last_update: '-1',
        price: -1
      },
      sell: {
        last_update: silverData.sell.date,
        price: silverData.sell.price
      }
    }
  }
}

async function readCurrent(extend = false): Promise<DBCompliantExtendedFormat | DBCompliantFormat> {
  const snapshot = await db.ref('/current').once('value')
  if (snapshot.exists()) {
    const data = snapshot.val() as DBCompliantExtendedFormat
    if (extend) return data
    return {
      captured_at: data.captured_at,
      gold: {
        buyback: {
          last_update: data.gold.buyback.last_update,
          price: data.gold.buyback.price
        },
        sell: {
          last_update: data.gold.sell.last_update,
          price: data.gold.sell.price
        }
      },
      silver: {
        buyback: {
          last_update: '-1',
          price: -1
        },
        sell: {
          last_update: data.silver.sell.last_update,
          price: data.silver.sell.price
        }
      }
    }
  }
  throw Error("Data unavailable")
}

async function stagedData(stagedData: DBCompliantFormat, currentData: DBCompliantExtendedFormat): Promise<DBCompliantExtendedFormat> {
  try {
    const staged: DBCompliantExtendedFormat = {
      captured_at: stagedData.captured_at,
      gold: {
        buyback: stagedData.gold.buyback,
        sell: stagedData.gold.sell,
        difference: {
          last_update: stagedData.gold.buyback.last_update,
          price: stagedData.gold.sell.price - stagedData.gold.buyback.price
        },
        change: {
          last_update: stagedData.gold.buyback.last_update,
          price: stagedData.gold.buyback.price - currentData.gold.buyback.price
        },
        sign: {
          last_update: stagedData.gold.buyback.last_update,
          price: Math.sign(stagedData.gold.buyback.price - currentData.gold.buyback.price)
        }
      },
      silver: {
        buyback: stagedData.silver.buyback,
        sell: stagedData.silver.sell,
        difference: {
          last_update: '-1',
          price: -1
        },
        change: {
          last_update: stagedData.silver.sell.last_update,
          price: stagedData.silver.sell.price - currentData.silver.sell.price
        },
        sign: {
          last_update: stagedData.silver.sell.last_update,
          price: Math.sign(stagedData.silver.sell.price - currentData.silver.sell.price)
        }
      }
    }
    return staged
  } catch (err) {
    throw err
  }
}


async function pushToDatabase(stagedData: DBCompliantFormat, currentData: DBCompliantExtendedFormat): Promise<DBCompliantFormat> {
  try {
    const staged: DBCompliantExtendedFormat = {
      captured_at: stagedData.captured_at,
      gold: {
        buyback: stagedData.gold.buyback,
        sell: stagedData.gold.sell,
        difference: {
          last_update: stagedData.gold.buyback.last_update,
          price: stagedData.gold.sell.price - stagedData.gold.buyback.price
        },
        change: {
          last_update: stagedData.gold.buyback.last_update,
          price: stagedData.gold.buyback.price - currentData.gold.buyback.price
        },
        sign: {
          last_update: stagedData.gold.buyback.last_update,
          price: Math.sign(stagedData.gold.buyback.price - currentData.gold.buyback.price)
        }
      },
      silver: {
        buyback: stagedData.silver.buyback,
        sell: stagedData.silver.sell,
        difference: {
          last_update: '-1',
          price: -1
        },
        change: {
          last_update: stagedData.silver.sell.last_update,
          price: stagedData.silver.sell.price - currentData.silver.sell.price
        },
        sign: {
          last_update: stagedData.silver.sell.last_update,
          price: Math.sign(stagedData.silver.sell.price - currentData.silver.sell.price)
        }
      }
    }
    await db.ref('/current').set(staged)
    await db.ref('/history').push(staged)
    return staged
  } catch (err) {
    throw err
  }
}

async function _temp_function_migrate() {
  let staged = stagedData(await scrapeAndFormatAll(), await readCurrent(true) as DBCompliantExtendedFormat)
  await db.ref("/history").push(await readCurrent(true) as DBCompliantExtendedFormat)
  console.log("done.")
}

// push
// console.log(await pushToDatabase(await scrapeAndFormatAll(), await readCurrent(true) as DBCompliantExtendedFormat)

//console.log(await scrape('gold'))

console.log(await _temp_function_migrate())

// end
await admin.app().delete()
