const { HOST, BASE_URL, SET_NOTIFICATION } = require('constants/appData').notificationsApi;
const axios = require('axios');

const URL = HOST + BASE_URL + SET_NOTIFICATION;

const sendNotification = async (reqData) => {
  const { API_KEY } = process.env;
  try {
    await axios.post('http://localhost:4000/notifications-api/set', reqData, { headers: { API_KEY } });
  } catch (error) {
    console.log(error.message);
  }
};
module.exports = { sendNotification };


