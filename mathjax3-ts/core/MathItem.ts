/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements the interface and abstract class for MathItem objects
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

import {MathDocument} from './MathDocument.js';
import {InputJax} from './InputJax.js';
import {OptionList} from '../util/Options.js';
import {MmlNode} from './MmlTree/MmlNode.js';

/*****************************************************************/
/*
 *  The Location gives a location of a position in a document
 *  (either a node and character position within it, or
 *  an index into a string array, the character position within
 *  the string, and the delimiter at that location).
 */

export type Location = {
    i?: number;
    n?: number;
    delim?: string;
    node?: Text | Element;
};

/*****************************************************************/
/*
 *  The Metrics object includes tht data needed to typeset
 *  a Mathitem.
 */

export type Metrics = {
    em: number;
    ex: number;
    containerWidth: number;
    lineWidth: number;
    scale: number;
};

/*****************************************************************/
/*
 *  The BBox object contains the data about the bounding box
 *  for the typeset element.
 */

export type BBox = {
    // will be defined later
};

/*****************************************************************/
/*
 *  The MathItem interface
 *
 *  The MathItem is the object that holds the information about a
 *  particular expression on the page, including pointers to
 *  where it is in the document, its compiled version (in the
 *  internal format), its typeset version, its bounding box,
 *  and so on.
 */

export interface MathItem {
    /*
     * The string represeting the expression to be processed
     */
    math: string;

    /*
     * The input jax used to process the math
     */
    inputJax: InputJax;

    /*
     * Whether the math is in display mode or inline mode
     */
    display: boolean;

    /*
     * The start and ending locations in the document of
     *   this expression
     */
    start: Location;
    end: Location;

    /*
     * The internal format for this expression (onece compiled)
     */
    root: MmlNode;

    /*
     * The typeset version of the expression (once typeset)
     */
    typesetRoot: Element;

    /*
     * The metric information at the location of the math
     * (the em-size, scaling factor, etc.)
     */
    metrics: Metrics;

    /*
     * The bounding box for the typeset math (once typeset)
     */
    bbox: BBox;

    /*
     * Extra data needed by the input or output jax, as needed
     */
    inputData: OptionList;
    outputData: OptionList;

    /*
     * Converts the expression into the internal format by calling the input jax
     *
     * @param{MathDocument} document  The MathDocument in which the math resides
     */
    compile(document: MathDocument): void;

    /*
     * Converts the internal format to the typeset version by caling the output jax
     *
     * @param{MathDocument} document  The MathDocument in which the math resides
     */
    typeset(document: MathDocument): void;

    /*
     * Adds any needed event handlers to the typeset output
     */
    addEventHandlers(): void;

    /*
     * Inserts the typeset version in place of the original form in the document
     *
     * @param{MathDocument} document  The MathDocument in which the math resides
     */
    updateDocument(document: MathDocument): void;

    /*
     * Removes the typeset version from the document, optionally replacing the original
     * form of the expression and its delimiters.
     *
     * @param{boolena} restore  True if the original version is to be restored
     */
    removeFromDocument(restore: boolean): void;

    /*
     * Sets the metric information for this expression
     *
     * @param{number} em      The size of 1 em in pixels
     * @param{number} ex      The size of 1 ex in pixels
     * @param{number} cwidth  The container width in pixels
     * @param{number} lwidth  The line breaking width in pixels
     * @param{number} scale   The scaling factor (unitless)
     */
    setMetrics(em: number, ex: number, cwidth: number, lwidth: number, scale: number): void;

    /*
     * Set or return the current processing state of this expression,
     * optionally restoring the document if rolling back an expression
     * that has been added to the document.
     *
     * @param{number} state    The state to set for the expression
     * @param{number} restore  True if the original form should be restored
     *                           when rolling back a typeset version
     */
    state(state?: number, restore?: boolean): number;

}

/*****************************************************************/
/*
 *  The ProtoItem interface
 *
 *  This is what is returned by the FindMath class, giving the location
 *  of math within the document, and is used to produce the full
 *  MathItem later (e.g., when the position within a string array
 *  is translated back into the actual node location in the DOM).
 */

export type ProtoItem = {
    math: string;      // The math expression itself
    start: Location;   // The starting location of the math
    end: Location;     // The ending location of the math
    open?: string;     // The opening delimiter
    close?: string;    // The closing delimiter
    n?: number;        // The index of the string in which this math is found
    display: boolean;  // True means display mode, false is inline mode
};

/*
 *  Produce a proto math item that can be turned into a MathItem
 */
export function protoItem(open: string, math: string, close: string, n: number,
                        start: number, end: number, display: boolean = null) {
    let item: ProtoItem = {open: open, math: math, close: close,
                           n: n, start: {n: start}, end: {n: end}, display: display};
    return item;
}

/*****************************************************************/
/*
 *  Implements the MathItem class
 */

export abstract class AbstractMathItem implements MathItem {

    public static STATE = {
        UNPROCESSED: 0,
        COMPILED: 1,
        TYPESET: 2,
        INSERTED: 3
    };

    public math: string;
    public inputJax: InputJax;
    public display: boolean;
    public start: Location;
    public end: Location;
    public root: MmlNode = null;
    public typesetRoot: Element = null;
    protected _state: number = STATE.UNPROCESSED;
    public metrics: Metrics = {} as Metrics;
    public bbox: BBox = {};
    public inputData: OptionList = {};
    public outputData: OptionList = {};

    /*
     * @param{string} math      The math expression for this item
     * @param{Inputjax} jax     The input jax to use for this item
     * @param{boolean} display  True if display mode, false if inline
     * @param{Location} start   The starting position of the math in the document
     * @param{Location} end     The ending position of the math in the document
     * @constructor
     */
    constructor (math: string, jax: InputJax, display: boolean = true,
                 start: Location = {i: 0, n: 0, delim: ''},
                 end: Location = {i: 0, n: 0, delim: ''}) {
        this.math = math;
        this.inputJax = jax;
        this.display = display;
        this.start = start;
        this.end = end;
        this.root = null;
        this.typesetRoot = null;
        this.metrics = {} as Metrics;
        this.bbox = {};
        this.inputData = {};
        this.outputData = {};
    }

    /*
     * @override
     */
    public compile(document: MathDocument) {
        if (this.state() < STATE.COMPILED) {
            this.root = this.inputJax.compile(this);
            this.state(STATE.COMPILED);
        }
    }

    /*
     * @override
     */
    public typeset(document: MathDocument) {
        if (this.state() < STATE.TYPESET) {
            this.typesetRoot = document.outputJax[this.display === null ? 'escaped' : 'typeset'](this, document);
            this.state(STATE.TYPESET);
        }
    }

    /*
     * @override
     */
    public addEventHandlers() {}

    /*
     * @override
     */
    public updateDocument(document: MathDocument) {}

    /*
     * @override
     */
    public removeFromDocument(restore: boolean = false) {}

    /*
     * @override
     */
    public setMetrics(em: number, ex: number, cwidth: number, lwidth: number, scale: number) {
        this.metrics = {
            em: em, ex: ex,
            containerWidth: cwidth,
            lineWidth: lwidth,
            scale: scale
        };
    }

    /*
     * @override
     */
    public state(state: number = null, restore: boolean = false) {
        if (state != null) {
            if (state < STATE.INSERTED && this._state >= STATE.INSERTED) {
                this.removeFromDocument(restore);
            }
            if (state < STATE.TYPESET && this._state >= STATE.TYPESET) {
                this.bbox = {};
                this.outputData = {};
            }
            if (state < STATE.COMPILED && this._state >= STATE.COMPILED) {
                this.inputData = {};
            }
            this._state = state;
        }
        return this._state;
    }

}

let STATE = AbstractMathItem.STATE;
