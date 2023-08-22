const config_api = require('./config');
const logger = require('./logger');
const downloader_api = require('./downloader');

const TelegramBot = require('node-telegram-bot-api');

 // checks if url is a valid URL
function isValidURL(str) {
    // tslint:disable-next-line: max-line-length
    const strRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/;
    const re = new RegExp(strRegex);
    const valid = re.test(str);

    if (!valid) { return false; }

    // tslint:disable-next-line: max-line-length
    const youtubeStrRegex = /(?:http(?:s)?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:(?:watch)?\?(?:.*&)?v(?:i)?=|(?:embed|v|vi|user)\/))([^\?&\"'<> #]+)/;
    const reYT = new RegExp(youtubeStrRegex);
    const ytValid = true || reYT.test(str);
    if (valid && ytValid && Date.now() - this.last_url_check > 1000) {
      if (str !== this.last_valid_url && this.allowQualitySelect) {
        // get info
        this.getURLInfo(str);
        this.argsChanged();
      }
      this.last_valid_url = str;
    }
    return valid;
  }

async function getTelegramRequests() {
    logger.verbose('Checking for notification to Telegram');
    const bot_token = config_api.getConfigItem('ytdl_telegram_bot_token');
    const chat_id = config_api.getConfigItem('ytdl_telegram_chat_id');
    const last_message_id = config_api.getConfigItem('ytdl_telegram_last_message_id') || 0;
    const bot = new TelegramBot(bot_token);
    // Get the newest updates and then filter them to just the chatID that we care about
    const updates = await bot.getUpdates({"offset": last_message_id + 1, "allowed_updates": ["message"]}).filter(update => update.message.chat.id == chat_id);
    const new_highest_message_id = updates.reduce((acc, cur) => Math.max(acc, cur.update_id), last_message_id);
    config_api.setConfigItem('ytdl_telegram_last_message_id', new_highest_message_id);
    // Check if there are any messages and see if they are urls
    const urls = updates.map(update => update.message.text).filter(isValidURL);
    const downloads_promises = urls.map(url => downloader_api.createDownload(url, 'video', {}, null));
    const download_objects = await Promise.allSettled(downloads_promises);
    logger.verbose(JSON.stringify(download_objects));
}

exports.checkForRequests = async () => {
    if (config_api.getConfigItem('ytdl_use_telegram_API') && config_api.getConfigItem('ytdl_use_telegram_requests') && config_api.getConfigItem('ytdl_telegram_bot_token') && config_api.getConfigItem('ytdl_telegram_chat_id')) {
        getTelegramRequests();
    }
};