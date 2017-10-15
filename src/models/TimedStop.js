// @flow
import Stop from './Stop';

/**
 * A stop with time information
 */
class TimedStop {
  stop: Stop;
  time: number; // 0 = 12:00AM, 3600 = 1:00AM, etc.
  isTimepoint: boolean;

  static clone (timedStop: TimedStop) {
    return new TimedStop(timedStop.stop, timedStop.time, timedStop.isTimepoint);
  }

  constructor (stop: Stop, time: number, isTimepoint: boolean) {
    this.stop = stop;
    this.time = time;
    this.isTimepoint = isTimepoint;
  }
}

export default TimedStop;
