import asyncio
import os
import re
import tempfile
import cv2
import numpy as np
import yt_dlp
from PIL import Image, ImageDraw, ImageFont

from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, FSInputFile
from aiogram.filters import CommandStart
from aiogram.enums import ParseMode

# ==================== НАСТРОЙКИ ====================

BOT_TOKEN = "9181743254:AAEgf6k23t4ZYLPACawNEJGqMtu5JCn5j0U"

ASCII_CHARS = " .:-=+*#%@"

# Путь к моноширинному шрифту (опционально).
# Linux:   "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
# Windows: "C:/Windows/Fonts/consola.ttf"
# macOS:   "/System/Library/Fonts/Menlo.ttc"
FONT_PATH = None  # None = встроенный шрифт PIL (маленький)

FONT_SIZE = 12
ASCII_WIDTH = 80          # ширина ASCII в символах
MAX_SECONDS = 30          # максимум секунд видео для обработки
FG_COLOR = (255, 255, 255)
BG_COLOR = (0, 0, 0)

TIKTOK_PATTERN = re.compile(
    r"(https?://)?(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/\S+",
    re.IGNORECASE,
)

# ==================== ИНИЦИАЛИЗАЦИЯ ====================

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# ==================== ASCII-КОНВЕРТАЦИЯ ====================

def resize_frame(frame, new_width):
    """Пропорционально уменьшает кадр под нужную ширину ASCII."""
    h, w = frame.shape[:2]
    aspect = h / w
    new_height = max(1, int(new_width * aspect * 0.5))
    return cv2.resize(frame, (new_width, new_height))

def frame_to_ascii_image(frame, width=ASCII_WIDTH):
    """Рендерит ASCII-кадр в PIL-изображение."""
    frame = resize_frame(frame, width)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    n = len(ASCII_CHARS)

    font = (
        ImageFont.truetype(FONT_PATH, FONT_SIZE)
        if FONT_PATH
        else ImageFont.load_default()
    )

    bbox = font.getbbox("M")
    char_w = max(1, bbox[2] - bbox[0])
    char_h = max(1, bbox[3] - bbox[1] + 4)

    rows, cols = gray.shape
    img = Image.new("RGB", (cols * char_w, rows * char_h), BG_COLOR)
    draw = ImageDraw.Draw(img)

    for y in range(rows):
        line = "".join(
            ASCII_CHARS[min(int(gray[y, x] / 256 * n), n - 1)]
            for x in range(cols)
        )
        draw.text((0, y * char_h), line, font=font, fill=FG_COLOR)

    return img

def process_video(input_path, output_path, width=ASCII_WIDTH):
    """Конвертирует видео в ASCII-видео (MP4)."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError("Не удалось открыть видео")

    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    if fps <= 0 or fps > 120:
        fps = 24

    max_frames = int(fps * MAX_SECONDS)
    writer = None

    try:
        for _ in range(max_frames):
            ret, frame = cap.read()
            if not ret:
                break

            img = frame_to_ascii_image(frame, width=width)
            frame_np = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

            if writer is None:
                h, w = frame_np.shape[:2]
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

            writer.write(frame_np)
    finally:
        cap.release()
        if writer:
            writer.release()

    return output_path

# ==================== СКАЧИВАНИЕ TIKTOK ====================

def download_tiktok(url, output_path):
    """Скачивает видео с TikTok через yt-dlp."""
    ydl_opts = {
        "outtmpl": output_path,
        "format": "mp4/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "merge_output_format": "mp4",
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

# ==================== ОБЩАЯ ОБРАБОТКА ====================

async def convert_and_send(message: Message, input_path: str, caption: str):
    """Конвертирует видео и отправляет результат."""
    with tempfile.TemporaryDirectory() as tmp:
        out_path = os.path.join(tmp, "ascii.mp4")

        await message.edit_text("🎨 Конвертирую в ASCII...")
        await asyncio.to_thread(process_video, input_path, out_path, ASCII_WIDTH)

        if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
            await message.edit_text("❌ Не удалось обработать видео.")
            return

        await message.edit_text("📤 Отправляю результат...")
        await message.reply_video(
            FSInputFile(out_path, filename="ascii.mp4"),
            caption=caption,
            supports_streaming=True,
        )
        await message.delete()

# ==================== ХЕНДЛЕРЫ ====================

@dp.message(CommandStart())
async def start(message: Message):
    await message.answer(
        "👋 Привет!\n\n"
        "Я превращаю видео в ASCII-анимацию.\n\n"
        "📹 Отправь мне *видео* (до 20 МБ, до 30 сек)\n"
        "🔗 Или пришли *ссылку на TikTok*\n\n"
        "И я верну тебе ASCII-видео 🎬",
        parse_mode=ParseMode.MARKDOWN,
    )


@dp.message(F.video | F.document)
async def handle_video(message: Message):
    video = message.video or message.document
    if not video:
        return

    # Проверка, что это видео
    if message.document:
        mime = video.mime_type or ""
        if not mime.startswith("video/"):
            await message.reply("Это не похоже на видео 🙃")
            return

    status = await message.reply("⏳ Скачиваю видео...")

    with tempfile.TemporaryDirectory() as tmp:
        in_path = os.path.join(tmp, "input.mp4")

        try:
            await bot.download(video, destination=in_path)
            await convert_and_send(status, in_path, "✅ Готово! ASCII-видео")
        except Exception as e:
            await status.edit_text(f"⚠️ Ошибка: {e}")


@dp.message(F.text & ~F.text.startswith("/"))
async def handle_text(message: Message):
    url = message.text.strip()
    if not TIKTOK_PATTERN.match(url):
        await message.reply("Пришли видео или ссылку на TikTok 🎬")
        return

    status = await message.reply("⏳ Скачиваю видео с TikTok...")

    with tempfile.TemporaryDirectory() as tmp:
        in_path = os.path.join(tmp, "tiktok.mp4")

        try:
            await asyncio.to_thread(download_tiktok, url, in_path)

            if not os.path.exists(in_path) or os.path.getsize(in_path) == 0:
                await status.edit_text("❌ Не удалось скачать видео по ссылке.")
                return

            await convert_and_send(status, in_path, "✅ Готово! ASCII из TikTok")
        except Exception as e:
            await status.edit_text(f"⚠️ Ошибка: {e}")

# ==================== ЗАПУСК ====================

async def main():
    print("Бот запущен...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())