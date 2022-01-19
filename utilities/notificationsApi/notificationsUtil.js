const { HOST, BASE_URL, SET_NOTIFICATION } = require('constants/appData').notificationsApi;
const axios = require('axios');

const URL = HOST + BASE_URL + SET_NOTIFICATION;

const sendNotification = async (reqData) => {
  const { API_KEY } = process.env;
  try {
    await axios.post(URL, reqData, { headers: { API_KEY } });
  } catch (error) {
    console.log(error.message);
  }
};
module.exports = { sendNotification };
