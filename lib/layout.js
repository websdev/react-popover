import { window } from './platform'
import { find, equalRecords } from './utils'



/* Axes System

This allows us to at-will work in a different orientation
without having to manually keep track of knowing if we should be using
x or y positions. */

const axes = {
  row: {},
  column: {},
}

axes.row.main = {
  start: `x`,
  end: `x2`,
  size: `w`,
}
axes.row.cross = {
  start: `y`,
  end: `y2`,
  size: `h`,
}
axes.column.main = axes.row.cross
axes.column.cross = axes.row.main



const types = [
  { name: `side`, values: [ `start`, `end` ]},
  { name: `standing`, values: [ `above`, `right`, `below`, `left` ]},
  { name: `flow`, values: [ `column`, `row` ]},
]

const validTypeValues = (
  types.reduce(
    (xs, { values }) => (xs.concat(values)),
    []
  )
)

const centerOfSize = (flow, axis, size) => (
  size[axes[flow][axis].size] / 2
)

const centerOfBounds = (flow, axis, bounds) => (
  bounds[axes[flow][axis].start] + (bounds[axes[flow][axis].size] / 2)
)

const centerOfBoundsFromBounds = (flow, axis, boundsTo, boundsFrom) => (
  centerOfBounds(flow, axis, boundsTo) - boundsFrom[axes[flow][axis].start]
)

const place = (flow, axis, align, bounds, size) => {
  const axisProps = axes[flow][axis]
  if (axis === `main`) {
    return (
      align === `center`
        ? centerOfBounds(flow, axis, bounds) - centerOfSize(flow, axis, size)
      : align === `end`
        ? bounds[axisProps.end]
      : align === `start`
        /* DOM rendering unfolds leftward. Therefore if the slave is positioned before
        the master then the slave`s position must in addition be pulled back
        by its [the slave`s] own length. */
        ? bounds[axisProps.start] - size[axisProps.size]
      : null
    )
  } else {
    return (
      align === `center`
        ? centerOfBounds(flow, axis, bounds) - centerOfSize(flow, axis, size)
      : align === `end`
        ? bounds[axisProps.end]
      : align === `start`
        ? bounds[axisProps.start]
      : null
    )
  }
}



/* Element Layout Queries */

const El = {}

El.calcBounds = (el) => {

  if (el === window) {
    return {
      x: 0,
      y: 0,
      x2: el.innerWidth,
      y2: el.innerHeight,
      w: el.innerWidth,
      h: el.innerHeight,
    }
  }

  const b = el.getBoundingClientRect()

  return {
    x: b.left,
    y: b.top,
    x2: b.right,
    y2: b.bottom,
    w: b.right - b.left,
    h: b.bottom - b.top,
  }
}

El.calcSize = (el) => (
  el === window ?
    { w: el.innerWidth, h: el.innerHeight } :
    { w: el.offsetWidth, h: el.offsetHeight }
)

El.calcScrollSize = (el) => (
  el === window ?
    {
      w: el.scrollX || el.pageXOffset,
      h: el.scrollY || el.pageYOffset,
    } :
    { w: el.scrollLeft, h: el.scrollTop }
)



/* Misc Utilities */

const getPreferenceType = (preference) => (
  types.reduce((found, type) => (
    found ?
      found :
    type.values.indexOf(preference) !== -1 ?
      type.name :
      null
  ), null)
)



/* Dimension Fit Checks */

const fitWithinChecker = (dimension) => (domainSize, itemSize) => (
  domainSize[dimension] > itemSize[dimension]
)

const doesWidthFitWithin = fitWithinChecker(`w`)
const doesHeightFitWithin = fitWithinChecker(`h`)

const doesFitWithin = (domainSize, itemSize) => (
  doesWidthFitWithin(domainSize, itemSize)
  && doesHeightFitWithin(domainSize, itemSize)
)



/* Errors */

const createPreferenceError = (givenValue) => (
  new Error(
    `The given layout placement of "${givenValue}" is not a valid choice. Valid choices are: ${validTypeValues.join(` | `)}.`
  )
)





/* Algorithm for picking the best fitting zone for popover. The current technique will loop through all zones picking the last one that fits. If
none fit the last one is selected.

TODO In the case that none fit we should pick the least-not-fitting zone. */

const pickZone = (opts, frameBounds, targetBounds, size) => {
  const t = targetBounds
  const f = frameBounds
  const zones = [
    { side: `start`, standing: `above`, flow: `column`, order: -1, w: f.x2, h: t.y },
    { side: `end`, standing: `right`, flow: `row`, order: 1, w: (f.x2 - t.x2), h: f.y2 },
    { side: `end`, standing: `below`, flow: `column`, order: 1, w: f.x2, h: (f.y2 - t.y2) },
    { side: `start`, standing: `left`, flow: `row`, order: -1, w: t.x, h: f.y2 },
  ]

  const availZones = zones.filter((zone) => (
    doesFitWithin(zone, size)
  ))

  /* If a place is required pick it from the available zones if possible. */

  if (opts.place) {
    const type = getPreferenceType(opts.place)
    if (!type) throw createPreferenceError(opts.place)
    const finder = (z) => z[type] === opts.place
    return find(finder, availZones) || find(finder, zones)
  }

  /* If the preferred side is part of the available zones, use that otherwise
  pick the largest available zone. If there are no available zones, pick the
  largest zone. TODO: logic that executes picking based on largest option. */

  if (opts.preferPlace) {
    const preferenceType = getPreferenceType(opts.preferPlace)
    if (!preferenceType) throw createPreferenceError(opts.preferPlace)
    const preferredAvailZones = availZones.filter((zone) => (
      zone[preferenceType] === opts.preferPlace
    ))
    if (preferredAvailZones.length) return preferredAvailZones[0]
  }

  return availZones.length ? availZones[0] : zones[0]
}



/* TODO Document this. */

const calcRelPos = (zone, masterBounds, slaveSize, align) => {
  const { main, cross } = axes[zone.flow]
  /* TODO: The slave is hard-coded to align cross-center with master. */
  const mainStart = place(zone.flow, `main`, zone.side, masterBounds, slaveSize)
  const mainSize = slaveSize[main.size]
  const crossStart = place(zone.flow, `cross`, align, masterBounds, slaveSize)
  const crossSize = slaveSize[cross.size]

  return {
    [main.start]: mainStart,
    mainLength: mainSize,
    [main.end]: mainStart + mainSize,
    [cross.start]: crossStart,
    crossLength: crossSize,
    [cross.end]: crossStart + crossSize,
  }
}



export {
  types,
  validTypeValues,
  calcRelPos,
  place,
  pickZone,
  axes,
  centerOfSize,
  centerOfBounds,
  centerOfBoundsFromBounds,
  doesFitWithin,
  equalRecords as equalCoords,
  El,
}
