"""Inline keyboard builders — port of api.ts inlineKeyboard / replyKeyboard."""
from __future__ import annotations

from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    KeyboardButton,
)


def ik(rows: list[list[dict]]) -> InlineKeyboardMarkup:
    """Build an inline keyboard from a list of button-row dicts.

    Each dict: {"text": str, "callback_data"?: str, "url"?: str}
    """
    keyboard = []
    for row in rows:
        buttons = []
        for b in row:
            btn = InlineKeyboardButton(text=b["text"])
            if b.get("callback_data"):
                btn.callback_data = b["callback_data"]
            if b.get("url"):
                btn.url = b["url"]
            buttons.append(btn)
        keyboard.append(buttons)
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def reply_kb(rows: list[list[str]]) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=t) for t in row] for row in rows],
        resize_keyboard=True,
    )


remove_keyboard = ReplyKeyboardRemove()
