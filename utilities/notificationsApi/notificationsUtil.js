const {
  HOST, BASE_URL, SET_NOTIFICATION, WS_SET_NOTIFICATION,
} = require('constants/appData').notificationsApi;
const axios = require('axios');
const { socketClient } = require('../socketClient/socketClient');

const URL = HOST + BASE_URL + SET_NOTIFICATION;

const sendNotification = async (reqData) => {
  const { API_KEY } = process.env;
  try {
    await axios.post(URL, reqData, { headers: { API_KEY } });
  } catch (error) {
    console.log(error.message);
  }
};

const sendSocketNotification = (operation) => {
  const message = JSON.stringify({ method: WS_SET_NOTIFICATION, payload: operation });
  socketClient.sendMessage(message);
};

module.exports = { sendNotification, sendSocketNotification };
