// @flow
import Path from './Path';

/**
 * A bus line hat runs at various times during the week.  The busline can
 * have multiple "paths" it takes, which are essentially loops or contiguous
 * series of traveling periods where the bus moves along a designated series
 * of stops.
 */
class Bus {
  paths: Array<Path>;
  lineNumber: number;

  constructor (paths: Array<Path>, lineNumber: number) {
    this.lineNumber = lineNumber;
    this.paths = paths;
  }
}

export default Bus;
