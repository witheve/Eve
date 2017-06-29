/*! chevrotain - v0.11.0 */
declare namespace chevrotain {
    class HashTable<V>{}
    /**
     *  This can be used to improve the quality/readability of error messages or syntax diagrams.
     *
     * @param {Function} clazz - A constructor for a Token subclass
     * @returns {string} the Human readable label a Token if it exists.
     */
    export function tokenLabel(clazz: Function): string;
    export function hasTokenLabel(clazz: Function): boolean;
    export function tokenName(clazz: Function): string;
    /**
     * utility to help the poor souls who are still stuck writing pure javascript 5.1
     * extend and create Token subclasses in a less verbose manner
     *
     * @param {string} tokenName - the name of the new TokenClass
     * @param {RegExp|Function} patternOrParent - RegExp Pattern or Parent Token Constructor
     * @param {Function} parentConstructor - the Token class to be extended
     * @returns {Function} - a constructor for the new extended Token subclass
     */
    export function extendToken(tokenName: string, patternOrParent?: any, parentConstructor?: Function): any;
    export class Token {
        image: string;
        startOffset: number;
        endOffset: number;
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
        /**
         * A "human readable" Label for a Token.
         * Subclasses of Token may define their own static LABEL property.
         * This label will be used in error messages and drawing syntax diagrams.
         *
         * For example a Token constructor may be called LCurly, which is short for LeftCurlyBrackets, These names are either too short
         * or too unwieldy to be used in error messages.
         *
         * Imagine : "expecting LCurly but found ')'" or "expecting LeftCurlyBrackets but found ')'"
         *
         * However if a static property LABEL with the value '{' exists on LCurly class, that error message will be:
         * "expecting '{' but found ')'"
         */
        static LABEL: string;
        isInsertedInRecovery: boolean;
        /**
         * @param {string} image the textual representation of the Token as it appeared in the text
         * @param {number} offset offset of the first character of the Token
         * @param {number} startLine line of the first character of the Token
         * @param {number} startColumn column of the first character of the Token
         * @param {number} endLine line of the last character of the Token
         * @param {number} endColumn column of the last character of the Token
         *
         * Things to note:
         * * "do"  {startColumn : 1, endColumn: 2} --> the range is inclusive to exclusive 1...2 (2 chars long).
         * * "\n"  {startLine : 1, endLine: 1} --> a lineTerminator as the last character does not effect the Token's line numbering.
         * * "'hello\tworld\uBBBB'"  {image: "'hello\tworld\uBBBB'"} --> a Token's image is the "literal" text
         *                                                              (unicode escaping is untouched).
         */
        constructor(image: string, offset: number, startLine: number, startColumn: number, endLine?: number, endColumn?: number);
    }
    /**
     * a special kind of Token which does not really exist in the input
     * (hence the 'Virtual' prefix). These type of Tokens can be used as special markers:
     * for example, EOF (end-of-file).
     */
    export class VirtualToken extends Token {
        constructor();
    }
    export class EOF extends VirtualToken {
    }

    export type TokenConstructor = Function;
    export interface ILexingResult {
        tokens: Token[];
        groups: {
            [groupName: string]: Token;
        };
        errors: ILexingError[];
    }
    export enum LexerDefinitionErrorType {
        MISSING_PATTERN = 0,
        INVALID_PATTERN = 1,
        EOI_ANCHOR_FOUND = 2,
        UNSUPPORTED_FLAGS_FOUND = 3,
        DUPLICATE_PATTERNS_FOUND = 4,
        INVALID_GROUP_TYPE_FOUND = 5,
        PUSH_MODE_DOES_NOT_EXIST = 6,
        MULTI_MODE_LEXER_WITHOUT_DEFAULT_MODE = 7,
        MULTI_MODE_LEXER_WITHOUT_MODES_PROPERTY = 8,
        MULTI_MODE_LEXER_DEFAULT_MODE_VALUE_DOES_NOT_EXIST = 9,
        LEXER_DEFINITION_CANNOT_CONTAIN_UNDEFINED = 10,
    }
    export interface ILexerDefinitionError {
        message: string;
        type: LexerDefinitionErrorType;
        tokenClasses?: Function[];
    }
    export interface ILexingError {
        line: number;
        column: number;
        length: number;
        message: string;
    }
    export type SingleModeLexerDefinition = TokenConstructor[];
    export type MultiModesDefinition = {
        [modeName: string]: TokenConstructor[];
    };
    export interface IMultiModeLexerDefinition {
        modes: MultiModesDefinition;
        defaultMode: string;
    }
    export class Lexer {
        protected lexerDefinition: SingleModeLexerDefinition | IMultiModeLexerDefinition;
        static SKIPPED: {
            description: string;
        };
        static NA: RegExp;
        lexerDefinitionErrors: ILexerDefinitionError[];
        protected modes: string[];
        protected defaultMode: string;
        protected allPatterns: {
            [modeName: string]: RegExp[];
        };
        protected patternIdxToClass: {
            [modeName: string]: Function[];
        };
        protected patternIdxToGroup: {
            [modeName: string]: string[];
        };
        protected patternIdxToLongerAltIdx: {
            [modeName: string]: number[];
        };
        protected patternIdxToCanLineTerminator: {
            [modeName: string]: boolean[];
        };
        protected patternIdxToPushMode: {
            [modeName: string]: string[];
        };
        protected patternIdxToPopMode: {
            [modeName: string]: boolean[];
        };
        protected emptyGroups: {
            [groupName: string]: Token;
        };
        /**
         * @param {SingleModeLexerDefinition | IMultiModeLexerDefinition} lexerDefinition -
         *  Structure composed of  constructor functions for the Tokens types this lexer will support.
         *
         *  In the case of {SingleModeLexerDefinition} the structure is simply an array of Token constructors.
         *  In the case of {IMultiModeLexerDefinition} the structure is an object with two properties
         *    1. a "modes" property where each value is an array of Token.
         *    2. a "defaultMode" property specifying the initial lexer mode.
         *
         *  constructors.
         *
         *  for example:
         *  {
         *     "modes" : {
         *     "modeX" : [Token1, Token2]
         *     "modeY" : [Token3, Token4]
         *     }
         *
         *     "defaultMode" : "modeY"
         *  }
         *
         *  A lexer with {MultiModesDefinition} is simply multiple Lexers where only one (mode) can be active at the same time.
         *  This is useful for lexing languages where there are different lexing rules depending on context.
         *
         *  The current lexing mode is selected via a "mode stack".
         *  The last (peek) value in the stack will be the current mode of the lexer.
         *
         *  Each Token class can define that it will cause the Lexer to (after consuming an instance of the Token)
         *  1. PUSH_MODE : push a new mode to the "mode stack"
         *  2. POP_MODE  : pop the last mode from the "mode stack"
         *
         *  Examples:
         *       export class Attribute extends Token {
         *          static PATTERN = ...
         *          static PUSH_MODE = "modeY"
         *       }
         *
         *       export class EndAttribute extends Token {
         *          static PATTERN = ...
         *          static POP_MODE = true
         *       }
         *
         *  The Token constructors must be in one of these forms:
         *
         *  1. With a PATTERN property that has a RegExp value for tokens to match:
         *     example: -->class Integer extends Token { static PATTERN = /[1-9]\d }<--
         *
         *  2. With a PATTERN property that has the value of the var Lexer.NA defined above.
         *     This is a convenience form used to avoid matching Token classes that only act as categories.
         *     example: -->class Keyword extends Token { static PATTERN = NA }<--
         *
         *
         *   The following RegExp patterns are not supported:
         *   a. '$' for match at end of input
         *   b. /b global flag
         *   c. /m multi-line flag
         *
         *   The Lexer will identify the first pattern that matches, Therefor the order of Token Constructors may be significant.
         *   For example when one pattern may match a prefix of another pattern.
         *
         *   Note that there are situations in which we may wish to order the longer pattern after the shorter one.
         *   For example: keywords vs Identifiers.
         *   'do'(/do/) and 'donald'(/w+)
         *
         *   * If the Identifier pattern appears before the 'do' pattern, both 'do' and 'donald'
         *     will be lexed as an Identifier.
         *
         *   * If the 'do' pattern appears before the Identifier pattern 'do' will be lexed correctly as a keyword.
         *     however 'donald' will be lexed as TWO separate tokens: keyword 'do' and identifier 'nald'.
         *
         *   To resolve this problem, add a static property on the keyword's constructor named: LONGER_ALT
         *   example:
         *
         *       export class Identifier extends Keyword { static PATTERN = /[_a-zA-Z][_a-zA-Z0-9]/ }
         *       export class Keyword extends Token {
         *          static PATTERN = lex.NA
         *          static LONGER_ALT = Identifier
         *       }
         *       export class Do extends Keyword { static PATTERN = /do/ }
         *       export class While extends Keyword { static PATTERN = /while/ }
         *       export class Return extends Keyword { static PATTERN = /return/ }
         *
         *   The lexer will then also attempt to match a (longer) Identifier each time a keyword is matched.
         *
         *
         * @param {boolean} [deferDefinitionErrorsHandling=false]
         *                  an optional flag indicating that lexer definition errors
         *                  should not automatically cause an error to be raised.
         *                  This can be useful when wishing to indicate lexer errors in another manner
         *                  than simply throwing an error (for example in an online playground).
         */
        constructor(lexerDefinition: SingleModeLexerDefinition | IMultiModeLexerDefinition, deferDefinitionErrorsHandling?: boolean);
        /**
         * Will lex(Tokenize) a string.
         * Note that this can be called repeatedly on different strings as this method
         * does not modify the state of the Lexer.
         *
         * @param {string} text - the string to lex
         * @param {string} [initialMode] - The initial Lexer Mode to start with, by default this will be the first mode in the lexer's
         *                                 definition. If the lexer has no explicit modes it will be the implicit single 'default_mode' mode.
         *
         * @returns {{tokens: {Token}[], errors: string[]}}
         */
        tokenize(text: string, initialMode?: string): ILexingResult;
    }

    export enum ParserDefinitionErrorType {
        INVALID_RULE_NAME = 0,
        DUPLICATE_RULE_NAME = 1,
        INVALID_RULE_OVERRIDE = 2,
        DUPLICATE_PRODUCTIONS = 3,
        UNRESOLVED_SUBRULE_REF = 4,
        LEFT_RECURSION = 5,
        NONE_LAST_EMPTY_ALT = 6,
        AMBIGUOUS_ALTS = 7,
    }
    export type IgnoredRuleIssues = {
        [dslNameAndOccurrence: string]: boolean;
    };
    export type IgnoredParserIssues = {
        [ruleName: string]: IgnoredRuleIssues;
    };
    export interface IParserConfig {
        /**
         * Is the error recovery / fault tolerance of the Chevrotain Parser enabled.
         */
        recoveryEnabled?: boolean;
        /**
         * Maximum number of tokens the parser will use to choose between alternatives.
         */
        maxLookahead?: number;
        /**
         * Used to mark parser definition errors that should be ignored.
         * For example:
         *
         * {
         *   myCustomRule : {
         *                   OR3 : true
         *                  },
         *
         *   myOtherRule : {
         *                  OPTION1 : true,
         *                  OR4 : true
         *                 }
         * }
         *
         * Be careful when ignoring errors, they are usually there for a reason :).
         */
        ignoredIssues?: IgnoredParserIssues;
    }
    export interface IRuleConfig<T> {
        /**
         * The function which will be invoked to produce the returned value for a production that have not been
         * successfully executed and the parser recovered from.
         */
        recoveryValueFunc?: () => T;
        /**
         * Enable/Disable re-sync error recovery for this specific production.
         */
        resyncEnabled?: boolean;
    }
    export interface IParserDefinitionError {
        message: string;
        type: ParserDefinitionErrorType;
        ruleName: string;
    }
    export interface IParserDuplicatesDefinitionError extends IParserDefinitionError {
        dslName: string;
        occurrence: number;
        parameter?: string;
    }
    export interface IParserEmptyAlternativeDefinitionError extends IParserDefinitionError {
        occurrence: number;
        alternative: number;
    }
    export interface IParserAmbiguousAlternativesDefinitionError extends IParserDefinitionError {
        occurrence: number;
        alternatives: number[];
    }
    export interface IParserUnresolvedRefDefinitionError extends IParserDefinitionError {
        unresolvedRefName: string;
    }
    export interface IFollowKey {
        ruleName: string;
        idxInCallingRule: number;
        inRule: string;
    }
    /**
     * OR([
     *  { WHEN:LA1, THEN_DO:XXX },
     *  { WHEN:LA2, THEN_DO:YYY },
     *  { WHEN:LA3, THEN_DO:ZZZ },
     * ])
     */
    export interface IOrAlt<T> {
        WHEN: () => boolean;
        THEN_DO: () => T;
    }
    /**
     * OR([
     *  {ALT:XXX },
     *  {ALT:YYY },
     *  {ALT:ZZZ }
     * ])
     */
    export interface IOrAltWithPredicate<T> {
        ALT: () => T;
    }
    export type IAnyOrAlt<T> = IOrAlt<T> | IOrAltWithPredicate<T>;
    export interface IParserState {
        errors: exceptions.IRecognitionException[];
        inputIdx: number;
        RULE_STACK: string[];
    }
    export type Predicate = () => boolean;
    export type GrammarAction = () => void;
    /**
     * Convenience used to express an empty alternative in an OR (alternation).
     * can be used to more clearly describe the intent in a case of empty alternation.
     *
     * For example:
     *
     * 1. without using EMPTY_ALT:
     *
     *    this.OR([
     *      {ALT: () => {
     *        this.CONSUME1(OneTok)
     *        return "1"
     *      }},
     *      {ALT: () => {
     *        this.CONSUME1(TwoTok)
     *        return "2"
     *      }},
     *      {ALT: () => { // implicitly empty because there are no invoked grammar rules (OR/MANY/CONSUME...) inside this alternative.
     *        return "666"
     *      }},
     *    ])
     *
     *
     * 2. using EMPTY_ALT:
     *
     *    this.OR([
     *      {ALT: () => {
     *        this.CONSUME1(OneTok)
     *        return "1"
     *      }},
     *      {ALT: () => {
     *        this.CONSUME1(TwoTok)
     *        return "2"
     *      }},
     *      {ALT: EMPTY_ALT("666")}, // explicitly empty, clearer intent
     *    ])
     *
     */
    export function EMPTY_ALT<T>(value?: T): () => T;
    /**
     * A Recognizer capable of self analysis to determine it's grammar structure
     * This is used for more advanced features requiring such information.
     * for example: Error Recovery, Automatic lookahead calculation
     */
    export class Parser {
        static NO_RESYNC: boolean;
        static DEFER_DEFINITION_ERRORS_HANDLING: boolean;
        protected static performSelfAnalysis(parserInstance: Parser): void;
        errors: exceptions.IRecognitionException[];
        /**
         * This flag enables or disables error recovery (fault tolerance) of the parser.
         * If this flag is disabled the parser will halt on the first error.
         */
        protected recoveryEnabled: boolean;
        protected maxLookahead: number;
        protected ignoredIssues: IgnoredParserIssues;
        protected _input: Token[];
        protected inputIdx: number;
        protected isBackTrackingStack: any[];
        protected className: string;
        protected RULE_STACK: string[];
        protected RULE_OCCURRENCE_STACK: number[];
        protected tokensMap: {
            [fqn: string]: Function;
        };
        /**
         * Only used internally for storing productions as they are built for the first time.
         * The final productions should be accessed from the static cache.
         */
        constructor(input: Token[], tokensMapOrArr: {
            [fqn: string]: Function;
        } | Function[], config?: IParserConfig);
        input: Token[];
        reset(): void;
        isAtEndOfInput(): boolean;
        getGAstProductions(): HashTable<gast.Rule>;
        protected isBackTracking(): boolean;
        protected SAVE_ERROR(error: exceptions.IRecognitionException): exceptions.IRecognitionException;
        protected NEXT_TOKEN(): Token;
        protected LA(howMuch: number): Token;
        /**
         * @param grammarRule - the rule to try and parse in backtracking mode
         * @param isValid - a predicate that given the result of the parse attempt will "decide" if the parse was successfully or not
         *
         * @return a lookahead function that will try to parse the given grammarRule and will return true if succeed
         */
        protected BACKTRACK<T>(grammarRule: (...args) => T, isValid: (T) => boolean): () => boolean;
        protected SKIP_TOKEN(): Token;
        /**
         * Convenience method equivalent to CONSUME1
         * @see CONSUME1
         */
        protected CONSUME(tokClass: Function): Token;
        /**
         *
         * A Parsing DSL method use to consume a single terminal Token.
         * a Token will be consumed, IFF the next token in the token vector is an instanceof tokClass.
         * otherwise the parser will attempt to perform error recovery.
         *
         * The index in the method name indicates the unique occurrence of a terminal consumption
         * inside a the top level rule. What this means is that if a terminal appears
         * more than once in a single rule, each appearance must have a difference index.
         *
         * for example:
         *
         * function parseQualifiedName() {
         *    this.CONSUME1(Identifier);
         *    this.MANY(()=> {
         *       this.CONSUME1(Dot);
         *       this.CONSUME2(Identifier); // <-- here we use CONSUME2 because the terminal
         *    });                           //     'Identifier' has already appeared previously in the
         *                                  //     the rule 'parseQualifiedName'
         * }
         *
         * @param {Function} tokClass - A constructor function specifying the type of token to be consumed.
         *
         * @returns {Token} The consumed token.
         */
        protected CONSUME1(tokClass: Function): Token;
        /**
         * @see CONSUME1
         */
        protected CONSUME2(tokClass: Function): Token;
        /**
         * @see CONSUME1
         */
        protected CONSUME3(tokClass: Function): Token;
        /**
         * @see CONSUME1
         */
        protected CONSUME4(tokClass: Function): Token;
        /**
         * @see CONSUME1
         */
        protected CONSUME5(tokClass: Function): Token;
        /**
         * Convenience method equivalent to SUBRULE1
         * @see SUBRULE1
         */
        protected SUBRULE<T>(ruleToCall: (number) => T, args?: any[]): T;
        /**
         * The Parsing DSL Method is used by one rule to call another.
         *
         * This may seem redundant as it does not actually do much.
         * However using it is mandatory for all sub rule invocations.
         * calling another rule without wrapping in SUBRULE(...)
         * will cause errors/mistakes in the Recognizer's self analysis
         * which will lead to errors in error recovery/automatic lookahead calculation
         * and any other functionality relying on the Recognizer's self analysis
         * output.
         *
         * As in CONSUME the index in the method name indicates the occurrence
         * of the sub rule invocation in its rule.
         *
         * @param {Function} ruleToCall - the rule to invoke
         * @param {*[]} args - the arguments to pass to the invoked subrule
         * @returns {*} the result of invoking ruleToCall
         */
        protected SUBRULE1<T>(ruleToCall: (number) => T, args?: any[]): T;
        /**
         * @see SUBRULE1
         */
        protected SUBRULE2<T>(ruleToCall: (number) => T, args?: any[]): T;
        /**
         * @see SUBRULE1
         */
        protected SUBRULE3<T>(ruleToCall: (number) => T, args?: any[]): T;
        /**
         * @see SUBRULE1
         */
        protected SUBRULE4<T>(ruleToCall: (number) => T, args?: any[]): T;
        /**
         * @see SUBRULE1
         */
        protected SUBRULE5<T>(ruleToCall: (number) => T, args?: any[]): T;
        /**
         * Convenience method equivalent to OPTION1
         * @see OPTION1
         */
        protected OPTION(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): boolean;
        /**
         * Parsing DSL Method that Indicates an Optional production
         * in EBNF notation: [...]
         *
         * note that the 'action' param is optional. so both of the following forms are valid:
         *
         * short: this.OPTION(()=>{ this.CONSUME(Digit});
         * long: this.OPTION(predicateFunc, ()=>{ this.CONSUME(Digit});
         *
         * The 'predicateFunc' in the long form can be used to add constraints (none grammar related)
         * to optionally invoking the grammar action.
         *
         * As in CONSUME the index in the method name indicates the occurrence
         * of the optional production in it's top rule.
         *
         * @param {Function} predicateOrAction - The predicate / gate function that implements the constraint on the grammar
         *                                       or the grammar action to optionally invoke once.
         * @param {Function} [action] - The action to optionally invoke.
         *
         * @returns {boolean} true iff the OPTION's action has been invoked
         */
        protected OPTION1(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): boolean;
        /**
         * @see OPTION1
         */
        protected OPTION2(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): boolean;
        /**
         * @see OPTION1
         */
        protected OPTION3(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): boolean;
        /**
         * @see OPTION1
         */
        protected OPTION4(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): boolean;
        /**
         * @see OPTION1
         */
        protected OPTION5(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): boolean;
        /**
         * Convenience method equivalent to OR1
         * @see OR1
         */
        protected OR<T>(alts: IAnyOrAlt<T>[], errMsgTypes?: string): T;
        /**
         * Parsing DSL method that indicates a choice between a set of alternatives must be made.
         * This is equivalent to EBNF alternation (A | B | C | D ...)
         *
         * There are two forms:
         *
         * short: this.OR([
         *           {ALT:()=>{this.CONSUME(One)}},
         *           {ALT:()=>{this.CONSUME(Two)}},
         *           {ALT:()=>{this.CONSUME(Three)}},
         *        ], "a number")
         *
         * long: this.OR([
         *           {WHEN: predicateFunc1, THEN_DO:()=>{this.CONSUME(One)}},
         *           {WHEN: predicateFuncX, THEN_DO:()=>{this.CONSUME(Two)}},
         *           {WHEN: predicateFuncX, THEN_DO:()=>{this.CONSUME(Three)}},
         *        ], "a number")
         *
         * They can also be mixed:
         * mixed: this.OR([
         *           {WHEN: predicateFunc1, THEN_DO:()=>{this.CONSUME(One)}},
         *           {ALT:()=>{this.CONSUME(Two)}},
         *           {ALT:()=>{this.CONSUME(Three)}}
         *        ], "a number")
         *
         * The 'predicateFuncX' in the long form can be used to add constraints (none grammar related) to choosing the alternative.
         *
         * As in CONSUME the index in the method name indicates the occurrence
         * of the alternation production in it's top rule.
         *
         * @param {{ALT:Function}[] | {WHEN:Function, THEN_DO:Function}[]} alts - An array of alternatives
         *
         * @param {string} [errMsgTypes] - A description for the alternatives used in error messages
         *                                 If none is provided, the error message will include the names of the expected
         *                                 Tokens sequences which may start each alternative.
         *
         * @returns {*} The result of invoking the chosen alternative
         */
        protected OR1<T>(alts: IAnyOrAlt<T>[], errMsgTypes?: string): T;
        /**
         * @see OR1
         */
        protected OR2<T>(alts: IAnyOrAlt<T>[], errMsgTypes?: string): T;
        /**
         * @see OR1
         */
        protected OR3<T>(alts: IAnyOrAlt<T>[], errMsgTypes?: string): T;
        /**
         * @see OR1
         */
        protected OR4<T>(alts: IAnyOrAlt<T>[], errMsgTypes?: string): T;
        /**
         * @see OR1
         */
        protected OR5<T>(alts: IAnyOrAlt<T>[], errMsgTypes?: string): T;
        /**
         * Convenience method equivalent to MANY1
         * @see MANY1
         */
        protected MANY(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): void;
        /**
         * Parsing DSL method, that indicates a repetition of zero or more.
         * This is equivalent to EBNF repetition {...}
         *
         * note that the 'action' param is optional. so both of the following forms are valid:
         *
         * short: this.MANY(()=>{
         *                       this.CONSUME(Comma};
         *                       this.CONSUME(Digit});
         *
         * long: this.MANY(predicateFunc, () => {
         *                       this.CONSUME(Comma};
         *                       this.CONSUME(Digit});
         *
         * The 'predicateFunc' in the long form can be used to add constraints (none grammar related) taking another iteration.
         *
         * As in CONSUME the index in the method name indicates the occurrence
         * of the repetition production in it's top rule.
         *
         * @param {Function} predicateOrAction - The predicate / gate function that implements the constraint on the grammar
         *                                   or the grammar action to optionally invoke multiple times.
         * @param {Function} [action] - The action to optionally invoke multiple times.
         */
        protected MANY1(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): void;
        /**
         * @see MANY1
         */
        protected MANY2(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): void;
        /**
         * @see MANY1
         */
        protected MANY3(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): void;
        /**
         * @see MANY1
         */
        protected MANY4(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): void;
        /**
         * @see MANY1
         */
        protected MANY5(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction): void;
        /**
         * Convenience method equivalent to MANY_SEP1
         * @see MANY_SEP1
         */
        protected MANY_SEP(separator: TokenConstructor, action: GrammarAction): Token[];
        /**
         * Parsing DSL method, that indicates a repetition of zero or more with a separator
         * Token between the repetitions.
         *
         * Example:
         *
         * this.MANY_SEP(Comma, () => {
         *                     this.CONSUME(Number};
         *                     ...
         *                   );
         *
         * Note that for the purposes of deciding on whether or not another iteration exists
         * Only a single Token is examined (The separator). Therefore if the grammar being implemented is
         * so "crazy" to require multiple tokens to identify an item separator please use the basic DSL methods
         * to implement it.
         *
         * As in CONSUME the index in the method name indicates the occurrence
         * of the repetition production in it's top rule.
         *
         * @param {TokenConstructor} separator - The Token class which will be used as a separator between repetitions.
         * @param {Function} [action] - The action to optionally invoke.
         *
         * @return {Token[]} - The consumed separator Tokens.
         */
        protected MANY_SEP1(separator: TokenConstructor, action: GrammarAction): Token[];
        /**
         * @see MANY_SEP1
         */
        protected MANY_SEP2(separator: TokenConstructor, action: GrammarAction): Token[];
        /**
         * @see MANY_SEP1
         */
        protected MANY_SEP3(separator: TokenConstructor, action: GrammarAction): Token[];
        /**
         * @see MANY_SEP1
         */
        protected MANY_SEP4(separator: TokenConstructor, action: GrammarAction): Token[];
        /**
         * @see MANY_SEP1
         */
        protected MANY_SEP5(separator: TokenConstructor, action: GrammarAction): Token[];
        /**
         * Convenience method equivalent to AT_LEAST_ONE1
         * @see AT_LEAST_ONE1
         */
        protected AT_LEAST_ONE(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction | string, errMsg?: string): void;
        /**
         *
         * convenience method, same as MANY but the repetition is of one or more.
         * failing to match at least one repetition will result in a parsing error and
         * cause the parser to attempt error recovery.
         *
         * @see MANY1
         *
         * @param {Function} predicateOrAction  - The predicate / gate function that implements the constraint on the grammar
         *                                        or the grammar action to invoke at least once.
         * @param {Function} [action] - The action to optionally invoke.
         * @param {string} [errMsg] short title/classification to what is being matched
         */
        protected AT_LEAST_ONE1(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction | string, errMsg?: string): void;
        /**
         * @see AT_LEAST_ONE1
         */
        protected AT_LEAST_ONE2(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction | string, errMsg?: string): void;
        /**
         * @see AT_LEAST_ONE1
         */
        protected AT_LEAST_ONE3(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction | string, errMsg?: string): void;
        /**
         * @see AT_LEAST_ONE1
         */
        protected AT_LEAST_ONE4(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction | string, errMsg?: string): void;
        /**
         * @see AT_LEAST_ONE1
         */
        protected AT_LEAST_ONE5(predicateOrAction: Predicate | GrammarAction, action?: GrammarAction | string, errMsg?: string): void;
        /**
         * Convenience method equivalent to AT_LEAST_ONE_SEP1
         * @see AT_LEAST_ONE1
         */
        protected AT_LEAST_ONE_SEP(separator: TokenConstructor, action: GrammarAction | string, errMsg?: string): Token[];
        /**
         *
         * convenience method, same as MANY_SEP but the repetition is of one or more.
         * failing to match at least one repetition will result in a parsing error and
         * cause the parser to attempt error recovery.
         *
         * @see MANY_SEP1
         *
         * @param {TokenConstructor} separator - The Token class which will be used as a separator between repetitions.
         * @param {Function} [action] - The action to optionally invoke.
         * @param {string} [errMsg] - short title/classification to what is being matched
         */
        protected AT_LEAST_ONE_SEP1(separator: TokenConstructor, action: GrammarAction | string, errMsg?: string): Token[];
        /**
         * @see AT_LEAST_ONE_SEP1
         */
        protected AT_LEAST_ONE_SEP2(separator: TokenConstructor, action: GrammarAction | string, errMsg?: string): Token[];
        /**
         * @see AT_LEAST_ONE_SEP1
         */
        protected AT_LEAST_ONE_SEP3(separator: TokenConstructor, action: GrammarAction | string, errMsg?: string): Token[];
        /**
         * @see AT_LEAST_ONE_SEP1
         */
        protected AT_LEAST_ONE_SEP4(separator: TokenConstructor, action: GrammarAction | string, errMsg?: string): Token[];
        /**
         * @see AT_LEAST_ONE_SEP1
         */
        protected AT_LEAST_ONE_SEP5(separator: TokenConstructor, action: GrammarAction | string, errMsg?: string): Token[];
        /**
         *
         * @param {string} name - The name of the rule.
         * @param {Function} implementation - The implementation of the rule.
         * @param {IRuleConfig} [config] - The rule's optional configuration
         *
         * @returns {Function} The parsing rule which is the production implementation wrapped with the parsing logic that handles
         *                     Parser state / error recovery&reporting/ ...
         */
        protected RULE<T>(name: string, implementation: (...implArgs: any[]) => T, config?: IRuleConfig<T>): (idxInCallingRule?: number, ...args: any[]) => T;
        /**
         * @See RULE
         * same as RULE, but should only be used in "extending" grammars to override rules/productions
         * from the super grammar.
         */
        protected OVERRIDE_RULE<T>(name: string, impl: (...implArgs: any[]) => T, config?: IRuleConfig<T>): (idxInCallingRule?: number, ...args: any[]) => T;
        protected ruleInvocationStateUpdate(ruleName: string, idxInCallingRule: number): void;
        protected ruleFinallyStateUpdate(): void;
        /**
         * Returns an "imaginary" Token to insert when Single Token Insertion is done
         * Override this if you require special behavior in your grammar
         * for example if an IntegerToken is required provide one with the image '0' so it would be valid syntactically
         */
        protected getTokenToInsert(tokClass: Function): Token;
        /**
         * By default all tokens type may be inserted. This behavior may be overridden in inheriting Recognizers
         * for example: One may decide that only punctuation tokens may be inserted automatically as they have no additional
         * semantic value. (A mandatory semicolon has no additional semantic meaning, but an Integer may have additional meaning
         * depending on its int value and context (Inserting an integer 0 in cardinality: "[1..]" will cause semantic issues
         * as the max of the cardinality will be greater than the min value. (and this is a false error!)
         */
        protected canTokenTypeBeInsertedInRecovery(tokClass: Function): boolean;
        /**
         * @param {Token} actualToken - The actual unexpected (mismatched) Token instance encountered.
         * @param {Function} expectedTokType - The Class of the expected Token.
         * @returns {string} The error message saved as part of a MismatchedTokenException.
         */
        protected getMisMatchTokenErrorMessage(expectedTokType: Function, actualToken: Token): string;
        protected getCurrentGrammarPath(tokClass: Function, tokIdxInRule: number): ITokenGrammarPath;
        protected getNextPossibleTokenTypes(grammarPath: ITokenGrammarPath): Function[];
        /**
         * @param tokClass - The Type of Token we wish to consume (Reference to its constructor function)
         * @param idx - occurrence index of consumed token in the invoking parser rule text
         *         for example:
         *         IDENT (DOT IDENT)*
         *         the first ident will have idx 1 and the second one idx 2
         *         * note that for the second ident the idx is always 2 even if its invoked 30 times in the same rule
         *           the idx is about the position in grammar (source code) and has nothing to do with a specific invocation
         *           details
         *
         * @returns the consumed Token
         */
        protected consumeInternal(tokClass: Function, idx: number): Token;
    }

    export namespace exceptions {
        interface IRecognizerContext {
            /**
             * A copy of the parser's rule stack at the "time" the RecognitionException occurred.
             * This can be used to help debug parsing errors (How did we get here?)
             */
            ruleStack: string[];
            /**
             * A copy of the parser's rule occurrence stack at the "time" the RecognitionException occurred.
             * This can be used to help debug parsing errors (How did we get here?)
             */
            ruleOccurrenceStack: number[];
        }
        interface IRecognitionException {
            name: string;
            message: string;
            /**
             * The token which caused the parser error.
             */
            token: Token;
            /**
             * Additional tokens which have been re-synced in error recovery due to the original error.
             * This information can be used the calculate the whole text area which has been skipped due to an error.
             * For example for displaying with a red underline in a text editor.
             */
            resyncedTokens: Token[];
            context: IRecognizerContext;
        }
        function isRecognitionException(error: Error): boolean;
        function MismatchedTokenException(message: string, token: Token): void;
        function NoViableAltException(message: string, token: Token): void;
        function NotAllInputParsedException(message: string, token: Token): void;
        function EarlyExitException(message: string, token: Token): void;
    }

    /**
     * this interfaces defines the path the parser "took" to reach a certain position
     * in the grammar.
     */
    export interface IGrammarPath {
        ruleStack: string[];
        occurrenceStack: number[];
    }
    export interface ITokenGrammarPath extends IGrammarPath {
        lastTok: Function;
        lastTokOccurrence: number;
    }
    export interface IRuleGrammarPath extends IGrammarPath {
        occurrence: number;
    }

    export namespace gast {
        interface IProduction {
            accept(visitor: GAstVisitor): void;
        }
        interface IProductionWithOccurrence extends IProduction {
            occurrenceInParent: number;
            implicitOccurrenceIndex: boolean;
        }
        abstract class AbstractProduction implements IProduction {
            definition: IProduction[];
            implicitOccurrenceIndex: boolean;
            constructor(definition: IProduction[]);
            accept(visitor: GAstVisitor): void;
        }
        class NonTerminal extends AbstractProduction implements IProductionWithOccurrence {
            nonTerminalName: string;
            referencedRule: Rule;
            occurrenceInParent: number;
            constructor(nonTerminalName: string, referencedRule?: Rule, occurrenceInParent?: number);
            definition: IProduction[];
            accept(visitor: GAstVisitor): void;
        }
        class Rule extends AbstractProduction {
            name: string;
            orgText: string;
            constructor(name: string, definition: IProduction[], orgText?: string);
        }
        class Flat extends AbstractProduction {
            constructor(definition: IProduction[]);
        }
        class Option extends AbstractProduction implements IProductionWithOccurrence {
            occurrenceInParent: number;
            constructor(definition: IProduction[], occurrenceInParent?: number);
        }
        class RepetitionMandatory extends AbstractProduction implements IProductionWithOccurrence {
            occurrenceInParent: number;
            constructor(definition: IProduction[], occurrenceInParent?: number);
        }
        class RepetitionMandatoryWithSeparator extends AbstractProduction implements IProductionWithOccurrence {
            separator: Function;
            occurrenceInParent: number;
            constructor(definition: IProduction[], separator: Function, occurrenceInParent?: number);
        }
        class Repetition extends AbstractProduction implements IProductionWithOccurrence {
            occurrenceInParent: number;
            constructor(definition: IProduction[], occurrenceInParent?: number);
        }
        class RepetitionWithSeparator extends AbstractProduction implements IProductionWithOccurrence {
            separator: Function;
            occurrenceInParent: number;
            constructor(definition: IProduction[], separator: Function, occurrenceInParent?: number);
        }
        class Alternation extends AbstractProduction implements IProductionWithOccurrence {
            occurrenceInParent: number;
            constructor(definition: Flat[], occurrenceInParent?: number);
        }
        class Terminal implements IProductionWithOccurrence {
            terminalType: Function;
            occurrenceInParent: number;
            implicitOccurrenceIndex: boolean;
            constructor(terminalType: Function, occurrenceInParent?: number);
            accept(visitor: GAstVisitor): void;
        }
        abstract class GAstVisitor {
            visit(node: IProduction): any;
            visitNonTerminal(node: NonTerminal): any;
            visitFlat(node: Flat): any;
            visitOption(node: Option): any;
            visitRepetition(node: Repetition): any;
            visitRepetitionMandatory(node: RepetitionMandatory): any;
            visitRepetitionMandatoryWithSeparator(node: RepetitionMandatoryWithSeparator): any;
            visitRepetitionWithSeparator(node: RepetitionWithSeparator): any;
            visitAlternation(node: Alternation): any;
            visitTerminal(node: Terminal): any;
            visitRule(node: Rule): any;
        }
    }

    /**
     * Clears the chevrotain internal cache.
     * This should not be used in regular work flows, This is intended for
     * unique use cases for example: online playground where the a parser with the same name is initialized with
     * different implementations multiple times.
     */
    export function clearCache(): void;

}

declare module "chevrotain" {
    export = chevrotain;
}
