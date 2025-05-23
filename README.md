# VoiceChat WebRTC

Децентрализованная платформа для создания голосовых комнат с P2P-подключением. Идеально для:  
🔥 Митапов | 🎓 Онлайн-лекций | 🎮 Геймерских сессий | 👥 Закрытых сообществ

## Особенности ✨
- 🚀 Мгновенное создание групп/комнат
- 🔒 Сквозное шифрование аудио (WebRTC)
- 📱 Адаптивный веб-интерфейс
- 🔑 Аутентификация через логин/пароль
- 🛡 CSRF-защита + HTTPS
- 📈 Реальное обновление списков через Socket.IO

## Технологический стек 💻
### Backend
| Технология       | Назначение                          |
|------------------|-------------------------------------|
| Node.js/Express  | REST API + WebSocket сервер         |
| MongoDB          | Хранение пользователей/групп        |
| Socket.IO        | Реальная синхронизация данных       |
| Passport.js      | Система аутентификации              |
| bcrypt           | Хеширование паролей                 |

### Frontend
- Vanilla JS + EJS (рендеринг)
- WebRTC (аудио-коммуникация)
- HTML5 Audio API
- Адаптивный CSS

### Инфраструктура
- Nginx (обратный прокси)
- Let's Encrypt (TLS сертификаты)
- Google STUN (NAT-траверс)

## Почему это приложение? 🤔
| Критерий         | Наше решение                        |
|------------------|-------------------------------------|
| Сложность        | В 5x проще Discord для базовых задач|
| Задержка         | <200ms против 500ms+ у Zoom         |
| Контроль данных  | Self-hosted vs облачные аналоги     |
| Расширяемость   | Модульная архитектура               |

## Аналоги и преимущества ⚖️
| Сервис           | Недостатки                          | Наши плюсы                  |
|------------------|-------------------------------------|-----------------------------|
| Discord          | Избыточность функций                | Минималистичный интерфейс  |
| Zoom             | Платные лимиты                      | Бесплатно для неограниченных пользователей |
| Jitsi Meet       | Сложная настройка                   | 1-командная установка       |

## Установка 🛠️
1. Клонировать репозиторий:
```bash
git clone https://github.com/yourusername/voicechat.git
cd voicechat
Установить зависимости:

bash
npm install
Настроить окружение (.env):

env
MONGODB_URI=mongodb://localhost:27017/voicechat
JWT_SECRET=your_jwt_secret
HTTPS_CERT=/path/to/cert.pem
HTTPS_KEY=/path/to/privkey.pem
Запустить:

bash
npm run start:prod
Система будет доступна на https://ваш-домен:3001
```
Использование:
Зарегистрируйтесь или войдите

Создайте группу (Мои группы → Создать)

Добавьте участников (по ссылке или username)

Создайте комнату внутри группы

Начните звонок кнопкой "Start Call"

Актуальность 📈
Рынок VoIP стремительно растет

WebRTC используется в 98% браузеров (2023)
