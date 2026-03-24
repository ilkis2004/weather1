import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = "http://localhost:8000/api";
const FAVORITES_KEY = "weatherFavorites";

function App() {
  const [weather, setWeather] = useState(null);
  const [hourlyForecast, setHourlyForecast] = useState([]);
  const [dailyForecast, setDailyForecast] = useState([]);
  const [city, setCity] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [serverError, setServerError] = useState(false);
  const [showHourly, setShowHourly] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setFavorites(parsed);
      }
    } catch (e) { console.error(e); }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) { console.error(e); }
  }, [favorites, isLoaded]);

  const fetchWeather = async (queryType, value) => {
    setLoading(true);
    setError("");
    setServerError(false);
    
    try {
      let urlCurrent = "", urlHourly = "", urlDaily = "";

      if (queryType === 'city') {
        urlCurrent = `${API_URL}/current?city=${encodeURIComponent(value)}`;
        urlHourly = `${API_URL}/hourly?city=${encodeURIComponent(value)}`;
        urlDaily = `${API_URL}/forecast?city=${encodeURIComponent(value)}`;
      } else if (queryType === 'coords') {
        urlCurrent = `${API_URL}/current?lat=${value.lat}&lon=${value.lon}`;
        urlHourly = `${API_URL}/hourly?lat=${value.lat}&lon=${value.lon}`;
        urlDaily = `${API_URL}/forecast?lat=${value.lat}&lon=${value.lon}`;
      }

      const [currentRes, hourlyRes, dailyRes] = await Promise.all([
        axios.get(urlCurrent, { timeout: 15000 }),
        axios.get(urlHourly, { timeout: 15000 }),
        axios.get(urlDaily, { timeout: 15000 })
      ]);

      setWeather(currentRes.data);
      setHourlyForecast(hourlyRes.data.hourly);
      setDailyForecast(dailyRes.data.forecast);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.message.includes('Network Error')) {
        setServerError(true);
        setError("Сервер недоступен. Запустите backend (python main.py)");
      } else if (err.response?.status === 503) {
        setError("Нет соединения с погодным сервисом.");
      } else if (err.response?.status === 404) {
        setError("Город не найден.");
      } else if (err.response?.status === 500) {
        setError("Ошибка API ключа.");
      } else {
        setError("Не удалось получить данные.");
      }
      console.error("Ошибка:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (city.trim()) fetchWeather('city', city);
  };

  const handleGeoLocation = () => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchWeather('coords', { lat: position.coords.latitude, lon: position.coords.longitude });
        },
        () => { setLoading(false); setError("Не удалось получить геолокацию."); }
      );
    } else {
      setError("Геолокация не поддерживается браузером.");
    }
  };

  const toggleFavorite = () => {
    if (!weather) return;
    const cityName = weather.name;
    if (favorites.includes(cityName)) {
      setFavorites(favorites.filter(c => c !== cityName));
    } else {
      if (!favorites.includes(cityName)) setFavorites([...favorites, cityName]);
    }
  };

  const removeFavorite = (e, cityName) => {
    e.stopPropagation();
    setFavorites(favorites.filter(c => c !== cityName));
  };

  const formatHour = (timeStr) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  // ✅ Получение текущей даты для отображения
  const getCurrentDate = () => {
    return new Date().toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric',
      weekday: 'long'
    });
  };

  // ✅ Группировка почасового прогноза по дням
  const groupHourlyByDate = (hourly) => {
    const groups = {};
    hourly.forEach(hour => {
      const date = hour.time.split(' ')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(hour);
    });
    return groups;
  };

  const hourlyGroups = groupHourlyByDate(hourlyForecast);

  return (
    <div className="container">
      <h1>Прогноз погоды</h1>
      
      {serverError && (
        <div className="server-error">
          ⚠️ <strong>Сервер не запущен!</strong><br/>
          <code>python main.py</code> в папке backend
        </div>
      )}

      <div className="search-box">
        <form onSubmit={handleSearch}>
          <input 
            type="text" 
            placeholder="Введите город..." 
            value={city} 
            onChange={(e) => setCity(e.target.value)} 
          />
          <button type="submit">Найти</button>
        </form>
        <button onClick={handleGeoLocation} className="geo-btn">📍 Моё местоположение</button>
      </div>

      {favorites.length > 0 && (
        <div className="favorites">
          <h3>Избранное:</h3>
          <div className="fav-list">
            {favorites.map(fav => (
              <span key={fav} className="fav-tag" onClick={() => { setCity(fav); fetchWeather('city', fav); }}>
                {fav}
                <button className="fav-delete" onClick={(e) => removeFavorite(e, fav)}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {error && !serverError && <div className="error">{error}</div>}
      {loading && <div className="loading">Загрузка...</div>}

      {weather && !serverError && (
        <div className="weather-card">
          <div className="header">
            <div>
              <h2>{weather.name}, {weather.sys.country}</h2>
              {/* ✅ Сегодняшнее число */}
              <p className="current-date">{getCurrentDate()}</p>
            </div>
            <button onClick={toggleFavorite} className="fav-btn">
              {favorites.includes(weather.name) ? "★ В избранном" : "☆ Добавить"}
            </button>
          </div>
          <div className="main-info">
            <img src={`https://openweathermap.org/img/wn/${weather.weather[0].icon}@2x.png`} alt="icon" />
            <h1>{Math.round(weather.main.temp)}°C</h1>
            <p>{weather.weather[0].description}</p>
          </div>
          <div className="details">
            <div>💧 Влажность: {weather.main.humidity}%</div>
            <div>💨 Ветер: {weather.wind.speed} м/с</div>
            <div>🌡 Давление: {weather.main.pressure} гПа</div>
          </div>
        </div>
      )}

      {hourlyForecast.length > 0 && dailyForecast.length > 0 && (
        <div className="forecast-toggle">
          <button className={showHourly ? "active" : ""} onClick={() => setShowHourly(true)}>
            🕐 Почасовой
          </button>
          <button className={!showHourly ? "active" : ""} onClick={() => setShowHourly(false)}>
            📅 На 5 дней
          </button>
        </div>
      )}

      {/* ✅ Почасовой прогноз БЕЗ прокрутки */}
      {showHourly && hourlyForecast.length > 0 && !serverError && (
        <div className="forecast">
          <h3>Почасовой прогноз</h3>
          <div className="forecast-list hourly-grid">
            {hourlyForecast.map((hour, index) => (
              <div key={index} className="forecast-item hourly">
                <p className="time">{formatHour(hour.time)}</p>
                <img src={`https://openweathermap.org/img/wn/${hour.icon}.png`} alt="icon" />
                <p className="temp">{Math.round(hour.temp)}°C</p>
                <small className="desc">{hour.description}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {!showHourly && dailyForecast.length > 0 && !serverError && (
        <div className="forecast">
          <h3>Прогноз на 5 дней</h3>
          <div className="forecast-list daily">
            {dailyForecast.map((day, index) => (
              <div key={index} className="forecast-item daily">
                <p className="date">{formatDate(day.date)}</p>
                <img src={`https://openweathermap.org/img/wn/${day.icon}.png`} alt="icon" />
                <p className="temp">{Math.round(day.temp)}°C</p>
                <small className="desc">{day.description}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;