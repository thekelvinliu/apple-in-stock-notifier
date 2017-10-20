import { SNS } from 'aws-sdk';
import fetch from 'node-fetch';

/**
 * requests apple product availability for a given part number and location
 * @param {Object} event - the event object triggering this lambda
 * @param {Object} context - the context object of this lambda
 * @param {Function} callback - the lambda callback function
 * @returns {Object} the result of the callback function
 */
export default function handler(event, context, callback) {
  console.log(fetch, SNS);
  return callback(null, 'ok');
}
