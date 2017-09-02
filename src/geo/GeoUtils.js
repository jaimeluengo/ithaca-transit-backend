// @flow
import type { PostProcessJourney, PostProcessBus } from './GeoTypes';

import GTFS from '../GTFS';
import OSRM from '../OSRM';
import TimedStop from '../models/TimedStop';

const interpolateTimes =
async (buses: Array<PostProcessBus>): Promise<void> => {
  // Create 2D matrix `durations`
  // durations[i][j] reflects how long (in seconds) it takes to drive
  // from location indexed by i to location indexed by j
  const coordinates = GTFS.stops.map(s => s.location.toArray());
  const response = await OSRM.table({coordinates});
  const durations = response.durations.map(d => d * 0.5);

  // first -> second TimedStop (the time to travel)
  const getTimeDiff = (first: TimedStop, second: TimedStop): number => {
    const i = GTFS.nameToStopIndex[first.stop.name];
    const j = GTFS.nameToStopIndex[second.stop.name];
    return durations[i][j];
  };

  // Function to handle interpolation of a journey
  const interpolateJourney = (journey: PostProcessJourney) => {
    // First timepoint index -
    // Pre-condition: there is at least one w/in the journey
    // or else we have no frame of reference as to when this journey occurs
    let firstTimepointIdx = journey.stops.length;
    for (let i = 0; i < journey.stops.length; i++) {
      if (journey.stops[i].timepoint) {
        firstTimepointIdx = i;
        break;
      }
    }

    // Backwards stage
    let workingIdx = firstTimepointIdx - 1;
    while (workingIdx >= 0) {
      let timedStop = journey.stops[workingIdx];
      let futureTimedStop = journey.stops[workingIdx + 1];
      let timeDiff = getTimeDiff(timedStop, futureTimedStop);
      timedStop.time = futureTimedStop.time - timeDiff;
      workingIdx--;
    }

    // Forwards stage
    for (let k = firstTimepointIdx + 1; k < journey.stops.length; k++) {
      if (journey.stops[k].timepoint) continue; // if it is already timepoint
      let timedStop = journey.stops[k];
      let prevTimedStop = journey.stops[k - 1];
      const i = GTFS.nameToStopIndex[timedStop.stop.name];
      const j = GTFS.nameToStopIndex[prevTimedStop.stop.name];
      let timeDiff = durations[i][j];
      timedStop.time = prevTimedStop.time + timeDiff;
    }
  };

  // Mutations to the timed stops
  for (let i = 0; i < buses.length; i++) {
    const bus = buses[i];
    for (let j = 0; j < bus.journeys.length; j++) {
      interpolateJourney(bus.journeys[j]);
    }
  }
};

export default {
  interpolateTimes
};
