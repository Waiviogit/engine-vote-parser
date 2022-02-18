const axios = require('axios');
const { telegramApi } = require('constants/appData');

exports.sendBotRCNotification = async (params) => {
  try {
    if (!['staging', 'production'].includes(process.env.NODE_ENV)) return;
    const result = await axios.post(
      `${telegramApi.HOST}${telegramApi.BASE_URL}${telegramApi.BOT_RC}`,
      params,
    );
    return { result: result.data };
  } catch (error) {
    return { error };
  }
};
