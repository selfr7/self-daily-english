import assert from 'node:assert/strict';
import {isMasteredSwipe} from '../app/swipe-gesture.ts';
assert.equal(isMasteredSwipe(80,5),true);assert.equal(isMasteredSwipe(-80,5),true);assert.equal(isMasteredSwipe(20,0),false);assert.equal(isMasteredSwipe(100,100),false);assert.equal(isMasteredSwipe(10,120),false);console.log('PASS: both swipe directions, short drags and vertical scrolling');
