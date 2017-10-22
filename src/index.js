import { SNS } from 'aws-sdk';
import fetch from 'node-fetch';
import qs from 'querystring';

// unpack environment variables
const {
  BASE_URL,
  MAX_DISTANCE = '50',
  SNS_ARN
} = process.env;
if (!BASE_URL)
  throw new Error('the BASE_URL environment variable must be set');
if (!SNS_ARN)
  throw new Error('the SNS_ARN environment variable must be set');

const cache = new Map();
const has = Object.prototype.hasOwnProperty;
const maxDistance = parseInt(MAX_DISTANCE, 10);
const sns = new SNS();

/**
 * requests apple product availability for a given part number and location
 * @param {Object} event - the event object triggering this lambda
 * @param {Object} context - the context object of this lambda
 * @param {Function} callback - the lambda callback function
 * @returns {Object} the result of the callback function
 */
export default async function handler(event, context, callback) {
  try {
    // log incoming event
    console.log('received event');
    console.log(JSON.stringify(event));

    // validate event input
    if (!has.call(event, 'location'))
      throw new Error('the event object is missing its location property');
    if (!has.call(event, 'parts.0'))
      throw new Error('the event object is missing its parts.0 property');

    // send request
    const url = `${BASE_URL}?${qs.stringify(event)}`;
    const json = await fetch(url).then(res => res.json());
    // grab store data
    const { body: { stores } } = json;
    if (!stores || !Array.isArray(stores))
      throw new Error('body.stores in the json response is not an array');
    // extract useful information
    const data = stores
      // only consider stores within MAX_DISTANCE miles
      .filter(obj => obj.storedistance <= maxDistance)
      // log store data
      .map(obj => {
        console.log(JSON.stringify(obj));
        return obj;
      })
      // format data
      .map(obj => {
        const {
          storeEmail: email,
          reservationUrl: homepage,
          storeNumber: id,
          storeName: name,
          phoneNumber,
          partsAvailability: {
            [event['parts.0']]: {
              storePickupQuote: message,
              storePickupProductTitle: product,
              pickupDisplay: status
            }
          }
        } = obj;
        return {
          id,
          name,
          product,
          available: status === 'available',
          message,
          email,
          phone: phoneNumber.replace(/\D/g, ''),
          homepage
        };
      });
    // cache new data
    const baseKey = Object.keys(event).sort().map(k => event[k]).join('|');
    await Promise.all(data.map(async incoming => {
      const key = `${baseKey}|${incoming.id}`;
      const current = cache.get(key);
      // do nothing if there's no change
      if (current && current.available === incoming.available) {
        console.log(`no change for key: '${key}'`);
        return Promise.resolve();
      }
      // save the incoming data
      cache.set(key, incoming);
      // create message
      const msg = [
        incoming.product,
        'is',
        incoming.available ? 'now available' : 'unavailable',
        'at',
        incoming.name
      ].join(' ');
      const payload = {
        Subject: msg.toLowerCase(),
        Message: JSON.stringify(incoming).toLowerCase(),
        TopicArn: SNS_ARN
      };
      console.log(`publishing payload for key: '${key}'`);
      console.log(JSON.stringify(payload));
      // publish payload to sns
      const { MessageId } = await sns.publish(payload).promise();
      console.log(`successfully published message with id '${MessageId}'`);
      return Promise.resolve();
    }));
  } catch (err) {
    console.error(err);
    return callback(err);
  }
  return callback(null, 'ok');
}
