const fs = require('fs');
const test = require('tape');
const path = require('path');
const load = require('load-json-file');
const write = require('write-json-file');
const truncate = require('@turf/truncate');
const {polygon, multiPolygon} = require('@turf/helpers');
const simplify = require('./');

const directories = {
    in: path.join(__dirname, 'test', 'in') + path.sep,
    out: path.join(__dirname, 'test', 'out') + path.sep
};

let fixtures = fs.readdirSync(directories.in).map(filename => {
    return {
        filename,
        name: path.parse(filename).name,
        geojson: load.sync(directories.in + filename)
    };
});
// fixtures = fixtures.filter(({name}) => name.includes('#555'));

test('simplify', t => {
    for (const {filename, name, geojson} of fixtures) {
        let {tolerance, highQuality} = geojson.properties || {};
        tolerance = tolerance || 0.01;
        highQuality = highQuality || false;

        const simplified = truncate(simplify(geojson, tolerance, highQuality));

        if (process.env.REGEN) write.sync(directories.out + filename, simplified);
        t.deepEqual(simplified, load.sync(directories.out + filename), name);
    }

    t.end();
});


test('simplify -- throw', t => {
    const poly = polygon([[[0, 0], [2, 2], [2, 0], [0, 0]]]);
    t.throws(() => simplify(null, 0.1), /geojson is required/, 'missing geojson');
    t.throws(() => simplify(poly, -1), /invalid tolerance/, 'negative tolerance');
    t.end();
});


test('simplify -- removes ID & BBox from properties', t => {
    const properties = {foo: 'bar'};
    const id = 12345;
    const bbox = [0, 0, 2, 2];
    const poly = polygon([[[0, 0], [2, 2], [2, 0], [0, 0]]], properties, bbox, id);
    const simple = simplify(poly, 0.1);

    t.equal(simple.id, id);
    t.deepEqual(simple.bbox, bbox);
    t.deepEqual(simple.properties, properties);
    t.end();
});


test('simplify -- issue #555', t => {
    // polygons from issue #555
    const poly1 = polygon([[[-75.693254, 45.431144], [-75.693335, 45.431109], [-75.693335, 45.431109], [-75.693254, 45.431144]]]);
    const poly2 = polygon([[[-75.627178, 45.438106], [-75.627179, 45.438106], [-75.62718, 45.438106], [-75.627178, 45.438106]]]);
    const poly3 = polygon([[[-75.684722, 45.410083], [-75.684641, 45.409989], [-75.684641, 45.409989], [-75.684722, 45.410083], [-75.684722, 45.410083]]]);
    const poly4 = polygon([[[-75.885634, 45.272762], [-75.885482, 45.272641], [-75.885554, 45.272596], [-75.885534, 45.272581], [-75.885581, 45.272551], [-75.885703, 45.272647], [-75.885706, 45.272645], [-75.885709, 45.272647], [-75.885767, 45.272693], [-75.885759, 45.272698], [-75.885716, 45.272728], [-75.885716, 45.272728], [-75.885712, 45.272731], [-75.885712, 45.272731], [-75.885708, 45.272734], [-75.885684, 45.272749], [-75.885671, 45.272739], [-75.885634, 45.272762]], [[-75.885708, 45.27273], [-75.885708, 45.272729], [-75.885708, 45.272729], [-75.885708, 45.27273]]]);

    t.throws(() => simplify(poly1, 0.000001, true), /invalid polygon/);
    t.throws(() => simplify(poly2, 0.000001, true), /invalid polygon/);
    t.throws(() => simplify(poly3, 0.000001, true), /invalid polygon/);
    t.throws(() => simplify(poly4, 0.000001, true), /invalid polygon/);
    t.end();
});

test('simplify -- issue #918', t => {
    // simplify hangs on this input #918
    t.skip('issue #918', multiPolygon([[[[0, 90], [0, 90], [0, 90], [0, 90], [0, 90], [0, 90], [0, 90], [0, 90], [0, 90], [0, 90], [0, 90]]]]));
    t.skip('issue #918', multiPolygon([[[[0, 1], [0, 2], [0, 3], [0, 2.5], [0, 1]]]]));
    t.skip('issue #918', multiPolygon([[[[0, 1], [0, 1], [1, 2], [0, 1]]]]));
    t.end();
});
