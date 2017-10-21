import { SNS } from 'aws-sdk';
import fetch from 'node-fetch';
import { URL } from 'url';

const BASE_URL = 'https://www.apple.com/shop/retail/pickup-message';

const cache = new Map();
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

    // validate variables
    const { SNS_ARN: TopicArn } = process.env;
    if (!TopicArn)
      throw new Error('the SNS_TOPIC environment variable must be set');
    const {
      cppart,
      partNumber,
      zipcode
    } = event;
    if (!partNumber)
      throw new Error('the event object is missing its partNumber property');
    if (!zipcode)
      throw new Error('the event object is missing its zipcode property');

    // construct url
    const url = new URL(BASE_URL);
    url.searchParams.set('location', zipcode);
    url.searchParams.set('parts.0', partNumber);
    if (cppart)
      url.searchParams.set('cppart', cppart);

    // get json response
    const json = await fetch(url.toString()).then(res => res.json());
    // grab store data
    const { body: { stores } } = json;
    if (!stores || !Array.isArray(stores))
      throw new Error('body.stores in the json response is not an array');
    // format data
    const data = stores
      .filter(obj => obj.storedistance <= 15)
      .map(obj => {
        const {
          storeEmail: email,
          reservationUrl: homepage,
          storeNumber: id,
          storeName: name,
          phoneNumber,
          partsAvailability: {
            [event.partNumber]: {
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
        return;
      }
      // save the incoming data
      cache.set(key, incoming);
      // create message
      const msg = [
        incoming.product,
        'is now',
        incoming.available ? 'available' : 'unavailable',
        'at',
        incoming.name
      ].join(' ');
      const payload = {
        Subject: msg.toLowerCase(),
        Message: JSON.stringify(incoming).toLowerCase(),
        TopicArn
      };
      console.log(`publishing payload for key: '${key}'`);
      console.log(JSON.stringify(payload));
      // publish payload to sns
      const { MessageId } = await sns.publish(payload).promise();
      console.log(`successfully published message with id '${MessageId}'`);
    }));
  } catch (err) {
    console.error(err);
    return callback(err);
  }
  return callback(null, 'ok');
}
