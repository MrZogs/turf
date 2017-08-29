var meta = require('@turf/meta');
var bearing = require('@turf/bearing');
var helpers = require('@turf/helpers');
var distance = require('@turf/distance');
var invariant = require('@turf/invariant');
var rhumbBearing = require('@turf/rhumb-bearing');
var rhumbDistance = require('@turf/rhumb-distance');
var turfLine = helpers.lineString;
var featureOf = invariant.featureOf;
var turfPoint = helpers.point;
var segmentEach = meta.segmentEach;
var bearingToAngle = helpers.bearingToAngle;
var convertDistance = helpers.convertDistance;
var degrees2radians = helpers.degrees2radians;

/**
 * Returns the minimum distance between a {@link Point} and a {@link LineString}, being the distance from a line the
 * minimum distance between the point and any segment of the `LineString`.
 * (logic of computation inspired by:
 * https://stackoverflow.com/questions/32771458/distance-from-lat-lng-point-to-minor-arc-segment)
 *
 * @name pointToLineDistance
 * @param {Feature<Point>|Array<number>} point Feature or Geometry
 * @param {Feature<LineString>|Array<Array<number>>} line GeoJSON Feature or Geometry
 * @param {string} [units=kilometers] can be degrees, radians, miles, or kilometers
 * @param {boolean} [mercator=false] if segments should be considered Rhumb lines
 * @returns {number} distance between point and line
 * @example
 * var pt = turf.point([0, 0]);
 * var line = turf.lineString([[1, 1],[-1, 1]);
 *
 * var d = pointToLineDistance(point, line, 'degrees');
 * //=1
 */
module.exports = function (point, line, units, mercator) {
    // validation
    if (!point) throw new Error('point is required');
    if (Array.isArray(point)) point = turfPoint(point);
    else featureOf(point, 'Point', 'point');
    if (!line) throw new Error('line is required');
    if (Array.isArray(line)) line = turfLine(line);
    else featureOf(line, 'LineString', 'line');

    var distance = Infinity;
    var p = point.geometry.coordinates;
    segmentEach(line, function (segment) {
        var a = segment.geometry.coordinates[0];
        var b = segment.geometry.coordinates[1];
        // var d = (mercator !== true) ? distanceToSegment(p, a, b, units) : mercatorDistanceToSegment(p, a, b, units);
        var d = distanceToSegment(p, a, b, units, mercator);
        if (distance > d) distance = d;
    });
    return distance;
};


function distanceToSegment(p, a, b, units, mercator) {

    var distanceAP = (mercator !== true) ? distance(a, p, units) : mercatorDistance(a, p, units);
    var azimuthAP = bearingToAngle((mercator !== true) ? bearing(a, p) : rhumbBearing(a, p));
    var azimuthAB = bearingToAngle((mercator !== true) ? bearing(a, b) : rhumbBearing(a, b));
    var angleA = Math.abs(azimuthAP - azimuthAB);
    // if the angle PAB is obtuse its projection on the line extending the segment falls outside the segment
    // thus return distance between P and the start point A
    /*
        P__
        |\ \____
        | \     \____
        |  \         \____
        |   \_____________\
        H    A             B
     */
    if (angleA > 90) return distanceAP;

    var azimuthBA = (azimuthAB + 180) % 360;
    var azimuthBP = bearingToAngle((mercator !== true) ? bearing(b, p) : rhumbBearing(b, p));
    var angleB = Math.abs(azimuthBP - azimuthBA);
    // also if the angle ABP is acute the projection of P falls outside the segment, on the other side
    // so return the distance between P and the end point B
    /*
                        ____P
                   ____/   /|
              ____/       / |
         ____/           /  |
        /______________/    |
       A               B    H
    */
    if (angleB > 90) return (mercator !== true) ? distance(p, b, units) : mercatorDistance(p, b, units);
    // finally if the projection falls inside the segment
    // return the distance between P and the segment
    /*
                     P
                  __/|\
               __/   | \
            __/      |  \
         __/         |   \
        /____________|____\
       A             H     B
    */
    if (mercator !== true) return distanceAP * Math.sin(degrees2radians(angleA));
    return mercatorPH(a, b, p, units);
}

function mercatorPH(a, b, p, units) {
    var origin = turfPoint(p);
    var A = toMercator(a);
    var B = toMercator(b);
    var P = toMercator(p);
    var h = toWGS84(euclideanIntersection(A, B, P));

    var distancePH = rhumbDistance(origin, h, units);
    return distancePH;
}


/**
 * Returns the point projection of a point on a line on the euclidean plain
 * from https://stackoverflow.com/questions/10301001/perpendicular-on-a-line-segment-from-a-given-point#answer-12499474
 *            P
 *         __/|\
 *      __/   | \
 *   __/      |  \
 *  /_________|___\
 * A          H    B
 *
 * @private
 * @param {Array<number>} a point
 * @param {Array<number>} b point
 * @param {Array<number>} p point
 * @returns {Array<number>} projection
 */
function euclideanIntersection(a, b, p) {
    var x1 = a[0], y1 = a[1],
        x2 = b[0], y2 = b[1],
        x3 = p[0], y3 = p[1];
    var px = x2 - x1, py = y2 - y1;
    var dab = px * px + py * py;
    var u = ((x3 - x1) * px + (y3 - y1) * py) / dab;
    var x = x1 + u * px, y = y1 + u * py;
    return [x, y]; // H
}


/**
 * Returns the squared distance between points
 *
 * @private
 * @param {object} p1 point
 * @param {object} p2 point
 * @returns {number} squared distance
 */
function mercatorDistance(from, to, units) {
    var p1 = toMercator(from);
    var p2 = toMercator(to);

    var sqr = function (n) { return n * n; };
    var squareD = sqr(p1[0] - p2[0]) + sqr(p1[1] - p2[1]);
    var d = Math.sqrt(squareD);
    return convertDistance(d, 'meters', units);
}

/**
 * Convert lon/lat values to 900913 x/y.
 * from https://github.com/mapbox/sphericalmercator
 *
 * @param lonLat
 * @return {[null,null]}
 */
function toMercator(lonLat) {
    var D2R = Math.PI / 180,
        // 900913 properties.
        A = 6378137.0,
        MAXEXTENT = 20037508.342789244;

    var xy = [
        A * lonLat[0] * D2R,
        A * Math.log(Math.tan((Math.PI * 0.25) + (0.5 * lonLat[1] * D2R)))
    ];
    // if xy value is beyond maxextent (e.g. poles), return maxextent.
    if (xy[0] > MAXEXTENT) xy[0] = MAXEXTENT;
    if (xy[0] < -MAXEXTENT) xy[0] = -MAXEXTENT;
    if (xy[1] > MAXEXTENT) xy[1] = MAXEXTENT;
    if (xy[1] < -MAXEXTENT) xy[1] = -MAXEXTENT;
    return xy;
}


/**
 * Convert 900913 x/y values to lon/lat.
 * from https://github.com/mapbox/sphericalmercator
 *
 * @private
 * @param xy
 * @returns {[null,null]}
 */
function toWGS84(xy) {
    // 900913 properties.
    var R2D = 180 / Math.PI,
        A = 6378137.0;

    return [
        (xy[0] * R2D / A),
        ((Math.PI * 0.5) - 2.0 * Math.atan(Math.exp(-xy[1] / A))) * R2D
    ];
}