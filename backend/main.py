import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("OPENWEATHER_API_KEY", "Key")
BASE_URL = "https://api.openweathermap.org/data/2.5"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"

async def reverse_geocode(lat: float, lon: float):
    """
    Обратный геокодинг через OpenStreetMap Nominatim
    Возвращает название города и код страны
    """
    try:
        async with httpx.AsyncClient(timeout=15.0, headers={"User-Agent": "WeatherApp/1.0"}) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    "lat": lat,
                    "lon": lon,
                    "format": "json",
                    "accept-language": "ru",
                    "zoom": 10,
                    "addressdetails": 1
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                address = data.get("address", {})
                
                # Ищем название города в разных полях (по приоритету)
                city = (
                    address.get("city") or 
                    address.get("town") or 
                    address.get("village") or 
                    address.get("municipality") or 
                    address.get("state") or 
                    address.get("county") or
                    "Местоположение"
                )
                
                country = address.get("country_code", "").upper()
                
                return {"name": city, "country": country}
    except Exception as e:
        print(f"Ошибка геокодинга: {e}")
    
    return {"name": "Местоположение", "country": ""}

@app.get("/api/current")
async def get_current_weather(city: str = None, lat: float = None, lon: float = None):
    params = {"appid": API_KEY, "units": "metric", "lang": "ru"}
    city_name, country = "", ""
    
    if city:
        params["q"] = city
    elif lat and lon:
        params["lat"] = lat
        params["lon"] = lon
        # Обратный геокодинг для координат
        location = await reverse_geocode(lat, lon)
        city_name = location["name"]
        country = location["country"]
    else:
        raise HTTPException(status_code=400, detail="Нужен город или координаты")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{BASE_URL}/weather", params=params)
        if resp.status_code == 401:
            raise HTTPException(status_code=500, detail="Неверный API ключ")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Город не найден")
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Ошибка API")
        
        data = resp.json()
        
        # Если город не был определён через Nominatim, берём из ответа OWM
        if not city_name:
            city_name = data.get("name", "Местоположение")
        if not country:
            country = data["sys"].get("country", "")
        
        return {
            "name": city_name,
            "sys": {"country": country},
            "main": {
                "temp": data["main"]["temp"],
                "humidity": data["main"]["humidity"],
                "pressure": data["main"]["pressure"]
            },
            "weather": [
                {"description": data["weather"][0]["description"], "icon": data["weather"][0]["icon"]}
            ],
            "wind": {"speed": data["wind"]["speed"]}
        }

@app.get("/api/hourly")
async def get_hourly_forecast(city: str = None, lat: float = None, lon: float = None, hours: int = 24):
    params = {"appid": API_KEY, "units": "metric", "lang": "ru"}
    city_name = ""
    
    if city:
        params["q"] = city
        city_name = city
    elif lat and lon:
        params["lat"] = lat
        params["lon"] = lon
        # Обратный геокодинг для координат
        location = await reverse_geocode(lat, lon)
        city_name = location["name"]
    else:
        raise HTTPException(status_code=400, detail="Нужен город или координаты")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{BASE_URL}/forecast", params=params)
        if resp.status_code == 401:
            raise HTTPException(status_code=500, detail="Неверный API ключ")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Город не найден")
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Ошибка получения прогноза")
        
        data = resp.json()
        hourly_list = []
        points_needed = max(8, hours // 3)
        
        for item in data["list"][:points_needed]:
            hourly_list.append({
                "time": item["dt_txt"],
                "temp": item["main"]["temp"],
                "description": item["weather"][0]["description"],
                "icon": item["weather"][0]["icon"],
                "humidity": item["main"]["humidity"],
                "wind": item["wind"]["speed"],
                "feels_like": item["main"]["feels_like"]
            })
            
        return {"city": city_name, "hourly": hourly_list}

@app.get("/api/forecast")
async def get_daily_forecast(city: str = None, lat: float = None, lon: float = None, days: int = 5):
    params = {"appid": API_KEY, "units": "metric", "lang": "ru"}
    city_name = ""
    
    if city:
        params["q"] = city
        city_name = city
    elif lat and lon:
        params["lat"] = lat
        params["lon"] = lon
        # Обратный геокодинг для координат
        location = await reverse_geocode(lat, lon)
        city_name = location["name"]
    else:
        raise HTTPException(status_code=400, detail="Нужен город или координаты")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{BASE_URL}/forecast", params=params)
        if resp.status_code == 401:
            raise HTTPException(status_code=500, detail="Неверный API ключ")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Город не найден")
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Ошибка получения прогноза")
        
        data = resp.json()
        daily_forecast = []
        seen_dates = set()
        
        for item in data["list"]:
            date = item["dt_txt"].split(" ")[0]
            time = item["dt_txt"].split(" ")[1]
            
            if date not in seen_dates and "12:00:00" in time:
                daily_forecast.append({
                    "date": date,
                    "temp": item["main"]["temp"],
                    "description": item["weather"][0]["description"],
                    "icon": item["weather"][0]["icon"],
                    "humidity": item["main"]["humidity"],
                    "wind": item["wind"]["speed"]
                })
                seen_dates.add(date)
                
        return {"city": city_name, "forecast": daily_forecast[:days]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
