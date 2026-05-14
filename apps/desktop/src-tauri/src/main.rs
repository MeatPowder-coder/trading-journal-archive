#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use std::{collections::HashMap, sync::Mutex};
use tauri::{async_runtime, AppHandle, Emitter, Manager, State};

const SECRET_SERVICE: &str = "Trading Journal Desktop";
const MAX_TASKS: usize = 8;
const FOOTPRINT_BUCKET_SIZE: f64 = 10.0;

#[derive(Default)]
struct MarketTasks {
  tasks: Mutex<HashMap<String, async_runtime::JoinHandle<()>>>,
}

#[derive(Default)]
struct MarketMemory {
  cvd: Mutex<HashMap<String, f64>>,
  footprint: Mutex<HashMap<String, FootprintBin>>,
}

#[derive(Clone, Copy)]
enum MarketType {
  Futures,
  Spot,
}

impl MarketType {
  fn from_input(value: &str) -> Self {
    match value.trim().to_lowercase().as_str() {
      "spot" => MarketType::Spot,
      _ => MarketType::Futures,
    }
  }
}

#[derive(Clone, Serialize)]
struct MarketCandle {
  symbol: String,
  timeframe: String,
  #[serde(rename = "openTime")]
  open_time: i64,
  #[serde(rename = "closeTime")]
  close_time: i64,
  open: f64,
  high: f64,
  low: f64,
  close: f64,
  volume: f64,
  closed: bool,
}

#[derive(Clone, Serialize)]
struct MarketAggTrade {
  symbol: String,
  #[serde(rename = "eventTime")]
  event_time: i64,
  price: f64,
  quantity: f64,
  #[serde(rename = "buyerMaker")]
  buyer_maker: bool,
}

#[derive(Clone, Serialize)]
struct CvdPoint {
  symbol: String,
  timestamp: i64,
  delta: f64,
  cumulative: f64,
}

#[derive(Clone, Serialize)]
struct FootprintBin {
  symbol: String,
  #[serde(rename = "candleOpenTime")]
  candle_open_time: i64,
  #[serde(rename = "priceBucket")]
  price_bucket: f64,
  #[serde(rename = "bidVolume")]
  bid_volume: f64,
  #[serde(rename = "askVolume")]
  ask_volume: f64,
  delta: f64,
  #[serde(rename = "totalVolume")]
  total_volume: f64,
  imbalance: f64,
}

#[derive(Clone, Serialize)]
struct LiquidationEvent {
  symbol: String,
  #[serde(rename = "eventTime")]
  event_time: i64,
  side: String,
  price: f64,
  quantity: f64,
  source: String,
}

fn parse_f64(value: &Value) -> f64 {
  value
    .as_str()
    .and_then(|raw| raw.parse::<f64>().ok())
    .or_else(|| value.as_f64())
    .unwrap_or(0.0)
}

fn parse_i64(value: &Value) -> i64 {
  value.as_i64().unwrap_or(0)
}

fn normalize_symbol(symbol: &str) -> String {
  symbol.trim().to_uppercase().replace('/', "")
}

fn timeframe_to_ms(timeframe: &str) -> i64 {
  match timeframe {
    "1m" => 60_000,
    "3m" => 180_000,
    "5m" => 300_000,
    "15m" => 900_000,
    "30m" => 1_800_000,
    "1h" => 3_600_000,
    "4h" => 14_400_000,
    "1d" => 86_400_000,
    _ => 60_000,
  }
}

fn price_bucket(price: f64) -> f64 {
  (price / FOOTPRINT_BUCKET_SIZE).round() * FOOTPRINT_BUCKET_SIZE
}

fn emit_agg_trade(app: &AppHandle, memory: &MarketMemory, trade: MarketAggTrade, timeframe: &str) {
  let aggressive_delta = if trade.buyer_maker { -trade.quantity } else { trade.quantity };
  let cumulative = {
    let mut cvd = memory.cvd.lock().expect("cvd mutex poisoned");
    let entry = cvd.entry(trade.symbol.clone()).or_insert(0.0);
    *entry += aggressive_delta;
    *entry
  };

  let candle_open_time = trade.event_time - (trade.event_time % timeframe_to_ms(timeframe));
  let bucket = price_bucket(trade.price);
  let footprint = {
    let mut footprints = memory.footprint.lock().expect("footprint mutex poisoned");
    let key = format!("{}:{}:{}", trade.symbol, candle_open_time, bucket);
    let entry = footprints.entry(key).or_insert(FootprintBin {
      symbol: trade.symbol.clone(),
      candle_open_time,
      price_bucket: bucket,
      bid_volume: 0.0,
      ask_volume: 0.0,
      delta: 0.0,
      total_volume: 0.0,
      imbalance: 0.0,
    });

    if trade.buyer_maker {
      entry.bid_volume += trade.quantity;
    } else {
      entry.ask_volume += trade.quantity;
    }
    entry.delta = entry.ask_volume - entry.bid_volume;
    entry.total_volume = entry.ask_volume + entry.bid_volume;
    entry.imbalance = if entry.total_volume > 0.0 {
      entry.delta / entry.total_volume
    } else {
      0.0
    };
    entry.clone()
  };

  let _ = app.emit("market:aggTrade", &trade);
  let _ = app.emit("market:cvd", CvdPoint {
    symbol: trade.symbol.clone(),
    timestamp: trade.event_time,
    delta: aggressive_delta,
    cumulative,
  });
  let _ = app.emit("market:footprint", footprint);
}

async fn listen_market_stream(app: AppHandle, symbol: String, timeframe: String, market_type: MarketType) {
  let lower = symbol.to_lowercase();
  let streams = match market_type {
    MarketType::Futures => format!(
      "{}@kline_{}/{}@aggTrade/{}@forceOrder",
      lower, timeframe, lower, lower
    ),
    MarketType::Spot => format!(
      "{}@kline_{}/{}@aggTrade",
      lower, timeframe, lower
    ),
  };
  let base_ws = match market_type {
    MarketType::Futures => "wss://fstream.binance.com/stream",
    MarketType::Spot => "wss://stream.binance.com:9443/stream",
  };
  let url = format!("{}?streams={}", base_ws, streams);
  let memory = app.state::<MarketMemory>();

  let Ok((socket, _)) = tokio_tungstenite::connect_async(url).await else {
    let _ = app.emit("market:status", format!("Failed to connect market stream for {}", symbol));
    return;
  };

  let (_, mut read) = socket.split();
  while let Some(message) = read.next().await {
    let Ok(message) = message else { break; };
    if !message.is_text() { continue; }
    let Ok(payload) = serde_json::from_str::<Value>(message.to_text().unwrap_or_default()) else { continue; };
    let data = payload.get("data").unwrap_or(&payload);
    let event_type = data.get("e").and_then(Value::as_str).unwrap_or_default();

    match event_type {
      "kline" => {
        let k = data.get("k").unwrap_or(data);
        let candle = MarketCandle {
          symbol: k.get("s").and_then(Value::as_str).unwrap_or(&symbol).to_string(),
          timeframe: k.get("i").and_then(Value::as_str).unwrap_or(&timeframe).to_string(),
          open_time: parse_i64(&k["t"]),
          close_time: parse_i64(&k["T"]),
          open: parse_f64(&k["o"]),
          high: parse_f64(&k["h"]),
          low: parse_f64(&k["l"]),
          close: parse_f64(&k["c"]),
          volume: parse_f64(&k["v"]),
          closed: k.get("x").and_then(Value::as_bool).unwrap_or(false),
        };
        let _ = app.emit("market:candle", candle);
      }
      "aggTrade" => {
        let trade = MarketAggTrade {
          symbol: data.get("s").and_then(Value::as_str).unwrap_or(&symbol).to_string(),
          event_time: parse_i64(&data["E"]),
          price: parse_f64(&data["p"]),
          quantity: parse_f64(&data["q"]),
          buyer_maker: data.get("m").and_then(Value::as_bool).unwrap_or(false),
        };
        emit_agg_trade(&app, &memory, trade, &timeframe);
      }
      "forceOrder" => {
        let order = data.get("o").unwrap_or(data);
        let liquidation = LiquidationEvent {
          symbol: order.get("s").and_then(Value::as_str).unwrap_or(&symbol).to_string(),
          event_time: parse_i64(&data["E"]),
          side: order.get("S").and_then(Value::as_str).unwrap_or("SELL").to_string(),
          price: parse_f64(&order["p"]),
          quantity: parse_f64(&order["q"]),
          source: "Binance forceOrder".to_string(),
        };
        let _ = app.emit("market:liquidation", liquidation);
      }
      _ => {}
    }
  }
}

#[tauri::command]
async fn subscribe_market_data(
  app: AppHandle,
  tasks: State<'_, MarketTasks>,
  symbol: String,
  timeframe: String,
  market_type: Option<String>,
) -> Result<(), String> {
  let symbol = normalize_symbol(&symbol);
  let market_type = MarketType::from_input(market_type.unwrap_or_else(|| "futures".to_string()).as_str());
  if symbol.is_empty() {
    return Err("Symbol is required".to_string());
  }

  let key = format!("{}:{}", symbol, match market_type {
    MarketType::Futures => "futures",
    MarketType::Spot => "spot",
  });
  let mut map = tasks.tasks.lock().map_err(|_| "Market task lock failed".to_string())?;
  if let Some(handle) = map.remove(&key) {
    handle.abort();
  }
  if map.len() >= MAX_TASKS {
    return Err("Too many active market streams".to_string());
  }

  let handle = async_runtime::spawn(listen_market_stream(app, symbol, timeframe, market_type));
  map.insert(key, handle);
  Ok(())
}

#[tauri::command]
async fn unsubscribe_market_data(tasks: State<'_, MarketTasks>, symbol: String, market_type: Option<String>) -> Result<(), String> {
  let symbol = normalize_symbol(&symbol);
  let market_type = MarketType::from_input(market_type.unwrap_or_else(|| "futures".to_string()).as_str());
  let key = format!("{}:{}", symbol, match market_type {
    MarketType::Futures => "futures",
    MarketType::Spot => "spot",
  });
  let mut map = tasks.tasks.lock().map_err(|_| "Market task lock failed".to_string())?;
  if let Some(handle) = map.remove(&key) {
    handle.abort();
  }
  Ok(())
}

#[tauri::command]
fn set_secure_secret(key: String, value: String) -> Result<(), String> {
  let entry = keyring::Entry::new(SECRET_SERVICE, &key).map_err(|error| error.to_string())?;
  entry.set_password(&value).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_secure_secret(key: String) -> Result<Option<String>, String> {
  let entry = keyring::Entry::new(SECRET_SERVICE, &key).map_err(|error| error.to_string())?;
  match entry.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(error) => Err(error.to_string()),
  }
}

#[tauri::command]
fn delete_secure_secret(key: String) -> Result<(), String> {
  let entry = keyring::Entry::new(SECRET_SERVICE, &key).map_err(|error| error.to_string())?;
  match entry.delete_credential() {
    Ok(()) => Ok(()),
    Err(keyring::Error::NoEntry) => Ok(()),
    Err(error) => Err(error.to_string()),
  }
}

fn main() {
  // Fix rustls provider selection when multiple providers are linked transitively.
  let _ = rustls::crypto::ring::default_provider().install_default();

  let mut builder = tauri::Builder::default()
    .manage(MarketTasks::default())
    .manage(MarketMemory::default());

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
      // Deep-link events are forwarded by the plugin when single-instance is enabled.
    }));
  }

  builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      subscribe_market_data,
      unsubscribe_market_data,
      set_secure_secret,
      get_secure_secret,
      delete_secure_secret
    ])
    .setup(|app| {
      #[cfg(any(windows, target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        app.deep_link().register_all()?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
