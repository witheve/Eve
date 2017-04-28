/*! chevrotain - v0.28.1 */
export as namespace chevrotain;
declare class HashTable<V>{}
/**
 *  The type of custom pattern matcher functions.
 *  Matches should only be done on the start of the text.
 *  Note that this is similar to the signature of RegExp.prototype.exec
 *
 *  This should behave as if the regExp match is using a start of input anchor.
 *  So: for example if a custom matcher is implemented for Tokens matching: /\w+/
 *  The implementation of the custom matcher must implement a custom matcher for /^\w+/.
 *
 *  The Optional tokens and groups arguments enable accessing information about
 *  previously identified tokens if necessary.
 *
 *  This can be used for example to lex python like indentation.
 *  see: https://github.com/SAP/chevrotain/blob/master/examples/lexer/python_indentation/python_indentation.js
 *  for a fuller example
 */
export declare type CustomPatternMatcherFunc = (test: string, offset?: number, tokens?: IToken[], groups?: {
    [groupName: string]: IToken;
}) => RegExpExecArray;
/**
 * Interface for custom user provided token pattern matchers.
 */
export interface ICustomPattern {
    /**
     * The custom pattern implementation.
     * @see CustomPatternMatcherFunc
     */
    exec: CustomPatternMatcherFunc;
    /**
     * Flag indicating if this custom pattern may contain line terminators.
     * This is required to avoid errors in the line/column numbering.
     * @default false - if this property was not explicitly defined.
     */
    containsLineTerminator?: boolean;
}
/**
 *  This can be used to improve the quality/readability of error messages or syntax diagrams.
 *
 * @param {Function} clazz - A constructor for a Token subclass
 * @returns {string} - The Human readable label for a Token if it exists.
 */
export declare function tokenLabel(clazz: Function): string;
export declare function hasTokenLabel(clazz: Function): boolean;
export declare function tokenName(clazz: Function): string;
export interface ITokenConfig {
    name: string;
    parent?: TokenConstructor;
    label?: string;
    pattern?: RegExp | CustomPatternMatcherFunc | ICustomPattern | string;
    group?: string | any;
    push_mode?: string;
    pop_mode?: boolean;
    longer_alt?: TokenConstructor;
}
/**
 * @param {ITokenConfig} config - The configuration for
 * @returns {TokenConstructor} - A constructor for the new Token subclass
 */
export declare function createToken(config: ITokenConfig): TokenConstructor;
/**
 *
 * @deprecated - Use the new CreateToken API
 *
 * utility to help the poor souls who are still stuck writing pure javascript 5.1
 * extend and create Token subclasses in a less verbose manner
 *
 * @param {string} tokenName - The name of the new TokenClass
 * @param {RegExp|CustomPatternMatcherFunc|Function} patternOrParent - RegExp Pattern or Parent Token Constructor
 * @param {Function} parentConstructor - The Token class to be extended
 * @returns {Function} - A constructor for the new extended Token subclass
 */
export declare function extendToken(tokenName: string, patternOrParent?: any, parentConstructor?: Function): TokenConstructor;
/**
 *   *
 * Things to note:
 * - "do"  {
 *          startColumn : 1, endColumn: 2,
 *          startOffset: x, endOffset: x +1} --> the range is inclusive to exclusive 1...2 (2 chars long).
 *
 * - "\n"  {startLine : 1, endLine: 1} --> a lineTerminator as the last character does not effect the Token's line numbering.
 *
 * - "'hello\tworld\uBBBB'"  {image: "'hello\tworld\uBBBB'"} --> a Token's image is the "literal" text
 *                                                              (unicode escaping is untouched).
 */
export interface IToken {
    /** The textual representation of the Token as it appeared in the text. */
    image: string;
    /** Offset of the first character of the Token. */
    startOffset: number;
    /** Line of the first character of the Token. */
    startLine?: number;
    /** Column of the first character of the Token. */
    startColumn?: number;
    /** Offset of the last character of the Token. */
    endOffset?: number;
    /** Line of the last character of the Token. */
    endLine?: number;
    /** Column of the last character of the Token. */
    endColumn?: number;
    /** this marks if a Token does not really exist and has been inserted "artificially" during parsing in rule error recovery. */
    isInsertedInRecovery?: boolean;
    /** An number index representing the type of the Token use <getTokenConstructor> to get the Token Type from a token "instance"  */
    tokenType?: number;
    /** A human readable name of the Token Class, This property will only be avilaible if the Lexer has run in <debugMode>
     *  @see {ILexerConfig} debug flag.
     *
     *  This property should not be used in productive flows as it will not always exist!
     * */
    tokenClassName?: number;
}
export declare class Token implements IToken {
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
    isInsertedInRecovery?: boolean;
    image: string;
    startOffset: number;
    startLine?: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
    endOffset?: number;
    /**
     * This class is never meant to be initialized.
     * The class hierarchy is used to organize Token metadata, not to create instances of Tokens.
     * Tokens are simple JavaScript objects which are NOT created using the <new> operator.
     * To get the class of a Token "instance" use <getTokenConstructor>.
     */
    constructor();
}
export declare class EOF extends Token {
}
/**
 * Utility to create Chevrotain Token "instances"
 * Note that Chevrotain tokens are not real instances, and thus the instanceOf cannot be used.
 *
 * @param tokClass
 * @param image
 * @param startOffset
 * @param endOffset
 * @param startLine
 * @param endLine
 * @param startColumn
 * @param endColumn
 * @returns {{image: string,
 *            startOffset: number,
 *            endOffset: number,
 *            startLine: number,
 *            endLine: number,
 *            startColumn: number,
 *            endColumn: number,
 *            tokenType}}
 */
export declare function createTokenInstance(tokClass: TokenConstructor, image: string, startOffset: number, endOffset: number, startLine: number, endLine: number, startColumn: number, endColumn: number): IToken;
/**
 * Given a Token instance, will return the Token Constructor.
 * Note that this function is not just for convenience, Because a Token "instance'
 * Does not use standard prototype inheritance and thus it's constructor cannot be accessed
 * by traversing the prototype chain.
 *
 * @param tokenInstance {IToken}
 * @returns {TokenConstructor}
 */
export declare function getTokenConstructor(tokenInstance: IToken): TokenConstructor;
/**
 * A Utility method to check if a token is of the type of the argument Token class.
 * Not that while this utility has similar semantics to ECMAScript "instanceOf"
 * As Chevrotain tokens support inheritance.
 *
 * It is not actually implemented using the "instanceOf" operator because
 * Chevrotain Tokens have their own performance optimized inheritance mechanism.
 *
 * @param tokInstance {IToken}
 * @param tokClass {TokenConstructor}
 * @returns {boolean}
 */
export declare function tokenMatcher(tokInstance: IToken, tokClass: TokenConstructor): boolean;

    export interface TokenConstructor extends Function {
    GROUP?: string;
    PATTERN?: RegExp | string;
    LABEL?: string;
    LONGER_ALT?: TokenConstructor;
    POP_MODE?: boolean;
    PUSH_MODE?: string;
    tokenName?: string;
    tokenType?: number;
    extendingTokenTypes?: number[];
    new (...args: any[]): IToken;
}
export interface ILexingResult {
    tokens: IToken[];
    groups: {
        [groupName: string]: IToken[];
    };
    errors: ILexingError[];
}
export declare enum LexerDefinitionErrorType {
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
    SOI_ANCHOR_FOUND = 11,
}
export interface ILexerDefinitionError {
    message: string;
    type: LexerDefinitionErrorType;
    tokenClasses?: Function[];
}
export interface ILexingError {
    offset: number;
    line: number;
    column: number;
    length: number;
    message: string;
}
export declare type SingleModeLexerDefinition = TokenConstructor[];
export declare type MultiModesDefinition = {
    [modeName: string]: TokenConstructor[];
};
export interface IMultiModeLexerDefinition {
    modes: MultiModesDefinition;
    defaultMode: string;
}
export interface IRegExpExec {
    exec: CustomPatternMatcherFunc;
}
export interface ILexerConfig {
    /**
     * An optional flag indicating that lexer definition errors
     * should not automatically cause an error to be raised.
     * This can be useful when wishing to indicate lexer errors in another manner
     * than simply throwing an error (for example in an online playground).
     */
    deferDefinitionErrorsHandling?: boolean;
    /**
     * "full" location information means all six combinations of /(end|start)(Line|Column|Offset)/ properties.
     * "onlyStart" means that only startLine, startColumn and startOffset will be tracked
     * "onlyOffset" means that only the startOffset will be tracked.
     *
     * The less position tracking the faster the Lexer will be and the less memory used.
     * However the difference is not large (~10% On V8), thus reduced location tracking options should only be used
     * in edge cases where every last ounce of performance is needed.
     */
    positionTracking?: "full" | "onlyStart" | "onlyOffset";
    /**
     * Run the Lexer in debug mode.
     * Features:
     * - The output tokens will contain their tokenConstructor name in a human readable manner.
     *   This information is always available by using the <getTokenConstructor> function on the official API.
     *   However, this is less convenient then a direct property when inspecting values in a debugger.
     *
     * DO NOT ENABLE THIS IN PRODUCTION has a large performance penalty.
     */
    debug?: boolean;
}
export declare class Lexer {
    protected lexerDefinition: SingleModeLexerDefinition | IMultiModeLexerDefinition;
    static SKIPPED: string;
    static NA: RegExp;
    lexerDefinitionErrors: ILexerDefinitionError[];
    protected patternIdxToConfig: any;
    protected modes: string[];
    protected defaultMode: string;
    protected emptyGroups: {
        [groupName: string]: IToken;
    };
                /**
     * @param {SingleModeLexerDefinition | IMultiModeLexerDefinition} lexerDefinition -
     *  Structure composed of constructor functions for the Tokens types this lexer will support.
     *
     *  In the case of {SingleModeLexerDefinition} the structure is simply an array of Token constructors.
     *  In the case of {IMultiModeLexerDefinition} the structure is an object with two properties:
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
     *  Each Token class can define that it will cause the Lexer to (after consuming an instance of the Token):
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
     * @param {ILexerConfig} [config=DEFAULT_LEXER_CONFIG] -
     *                  The Lexer's configuration @see {ILexerConfig} for details.
     */
    constructor(lexerDefinition: SingleModeLexerDefinition | IMultiModeLexerDefinition, config?: ILexerConfig);
    /**
     * Will lex(Tokenize) a string.
     * Note that this can be called repeatedly on different strings as this method
     * does not modify the state of the Lexer.
     *
     * @param {string} text - The string to lex
     * @param {string} [initialMode] - The initial Lexer Mode to start with, by default this will be the first mode in the lexer's
     *                                 definition. If the lexer has no explicit modes it will be the implicit single 'default_mode' mode.
     *
     * @returns {ILexingResult}
     */
    tokenize(text: string, initialMode?: string): ILexingResult;
                                            }

    export declare enum ParserDefinitionErrorType {
    INVALID_RULE_NAME = 0,
    DUPLICATE_RULE_NAME = 1,
    INVALID_RULE_OVERRIDE = 2,
    DUPLICATE_PRODUCTIONS = 3,
    UNRESOLVED_SUBRULE_REF = 4,
    LEFT_RECURSION = 5,
    NONE_LAST_EMPTY_ALT = 6,
    AMBIGUOUS_ALTS = 7,
    CONFLICT_TOKENS_RULES_NAMESPACE = 8,
    INVALID_TOKEN_NAME = 9,
    INVALID_NESTED_RULE_NAME = 10,
    DUPLICATE_NESTED_NAME = 11,
    NO_NON_EMPTY_LOOKAHEAD = 12,
    AMBIGUOUS_PREFIX_ALTS = 13,
}
export declare type IgnoredRuleIssues = {
    [dslNameAndOccurrence: string]: boolean;
};
export declare type IgnoredParserIssues = {
    [ruleName: string]: IgnoredRuleIssues;
};
export declare type TokenMatcher = (token: IToken, tokClass: TokenConstructor) => boolean;
export declare type TokenInstanceIdentityFunc = (tok: IToken) => string;
export declare type TokenClassIdentityFunc = (tok: TokenConstructor) => string;
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
    /**
     * Enable This Flag to to support Dynamically defined Tokens via inheritance.
     * This will disable performance optimizations which cannot work if the whole Token vocabulary is not known
     * During Parser initialization.
     */
    dynamicTokensEnabled?: boolean;
    /**
     * Enable automatic Concrete Syntax Tree creation
     * For in-depth docs:
     * {@link https://github.com/SAP/chevrotain/blob/master/docs/concrete_syntax_tree.md}
     */
    outputCst?: boolean;
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
    ruleName?: string;
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
 *  {ALT:XXX },
 *  {ALT:YYY },
 *  {ALT:ZZZ }
 * ])
 */
export interface IOrAlt<T> {
    ALT: () => T;
}
/**
 * OR([
 *  { GATE:condition1, ALT:XXX },
 *  { GATE:condition2, ALT:YYY },
 *  { GATE:condition3, ALT:ZZZ }
 * ])
 */
export interface IOrAltWithGate<T> extends IOrAlt<T> {
    NAME?: string;
    GATE: () => boolean;
    ALT: () => T;
}
export declare type IAnyOrAlt<T> = IOrAlt<T> | IOrAltWithGate<T>;
export interface IParserState {
    errors: exceptions.IRecognitionException[];
    lexerState: any;
    RULE_STACK: string[];
    CST_STACK: CstNode[];
    LAST_EXPLICIT_RULE_STACK: number[];
}
export interface DSLMethodOpts<T> {
    /**
     * in-lined method name
     */
    NAME?: string;
    /**
     * The Grammar to process in this method.
     */
    DEF: GrammarAction<T>;
    /**
     * A semantic constraint on this DSL method
     * @see https://github.com/SAP/chevrotain/blob/master/examples/parser/predicate_lookahead/predicate_lookahead.js
     * For farther details.
     */
    GATE?: Predicate;
}
export interface DSLMethodOptsWithErr<T> extends DSLMethodOpts<T> {
    /**
     *  Short title/classification to what is being matched.
     *  Will be used in the error message,.
     *  If none is provided, the error message will include the names of the expected
     *  Tokens sequences which start the method's inner grammar
     */
    ERR_MSG?: string;
}
export interface OrMethodOpts<T> {
    NAME?: string;
    /**
     * The set of alternatives,
     * See detailed description in @link {Parser.OR1}
     */
    DEF: IAnyOrAlt<T>[];
    /**
     * A description for the alternatives used in error messages
     * If none is provided, the error message will include the names of the expected
     * Tokens sequences which may start each alternative.
     */
    ERR_MSG?: string;
}
export interface ManySepMethodOpts<T> {
    NAME?: string;
    /**
     * The Grammar to process in each iteration.
     */
    DEF: GrammarAction<T>;
    /**
     * The separator between each iteration.
     */
    SEP: TokenConstructor;
}
export interface AtLeastOneSepMethodOpts<T> extends ManySepMethodOpts<T> {
    /**
     *  Short title/classification to what is being matched.
     *  Will be used in the error message,.
     *  If none is provided, the error message will include the names of the expected
     *  Tokens sequences which start the method's inner grammar
     */
    ERR_MSG?: string;
}
export declare type Predicate = () => boolean;
export declare type GrammarAction<OUT> = () => OUT;
export declare type ISeparatedIterationResult<OUT> = {
    values: OUT[];
    separators: IToken[];
};
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
export declare function EMPTY_ALT<T>(value?: T): () => T;
/**
 * A Recognizer capable of self analysis to determine it's grammar structure
 * This is used for more advanced features requiring such information.
 * For example: Error Recovery, Automatic lookahead calculation.
 */
export declare class Parser {
    static NO_RESYNC: boolean;
    static DEFER_DEFINITION_ERRORS_HANDLING: boolean;
    protected static performSelfAnalysis(parserInstance: Parser): void;
    protected _errors: exceptions.IRecognitionException[];
    /**
     * This flag enables or disables error recovery (fault tolerance) of the parser.
     * If this flag is disabled the parser will halt on the first error.
     */
    protected recoveryEnabled: boolean;
    protected dynamicTokensEnabled: boolean;
    protected maxLookahead: number;
    protected ignoredIssues: IgnoredParserIssues;
    protected outputCst: boolean;
    protected _input: IToken[];
    protected inputIdx: number;
    protected savedTokenIdx: number;
    protected isBackTrackingStack: any[];
    protected className: string;
    protected RULE_STACK: string[];
    protected RULE_OCCURRENCE_STACK: number[];
    protected CST_STACK: CstNode[];
    protected tokensMap: {
        [fqn: string]: TokenConstructor;
    };
                                                        /**
     * Only used internally for storing productions as they are built for the first time.
     * The final productions should be accessed from the static cache.
     */
        constructor(input: IToken[], tokensDictionary: {
        [fqn: string]: TokenConstructor;
    } | TokenConstructor[] | IMultiModeLexerDefinition, config?: IParserConfig);
    errors: exceptions.IRecognitionException[];
    input: IToken[];
    /**
     * Resets the parser state, should be overridden for custom parsers which "carry" additional state.
     * When overriding, remember to also invoke the super implementation!
     */
    reset(): void;
    isAtEndOfInput(): boolean;
    getBaseCstVisitorConstructor(): {
        new (...args: any[]): ICstVisitor<any, any>;
    };
    getBaseCstVisitorConstructorWithDefaults(): {
        new (...args: any[]): ICstVisitor<any, any>;
    };
    getGAstProductions(): HashTable<gast.Rule>;
    getSerializedGastProductions(): gast.ISerializedGast[];
    /**
     * @param startRuleName {string}
     * @param precedingInput {IToken[]} - The token vector up to (not including) the content assist point
     * @returns {ISyntacticContentAssistPath[]}
     */
    computeContentAssist(startRuleName: string, precedingInput: IToken[]): ISyntacticContentAssistPath[];
    protected isBackTracking(): boolean;
    protected getCurrRuleFullName(): string;
    protected shortRuleNameToFullName(shortName: string): string;
    protected getHumanReadableRuleStack(): string[];
    protected SAVE_ERROR(error: exceptions.IRecognitionException): exceptions.IRecognitionException;
    /**
     * @param grammarRule - The rule to try and parse in backtracking mode.
     * @param isValid - A predicate that given the result of the parse attempt will "decide" if the parse was successfully or not.
     *
     * @return {Function():boolean} a lookahead function that will try to parse the given grammarRule and will return true if succeed.
     */
    protected BACKTRACK<T>(grammarRule: (...args:any[]) => T, isValid: (a:T) => boolean): () => boolean;
    protected SKIP_TOKEN(): IToken;
    /**
     * Convenience method equivalent to CONSUME1.
     * @see CONSUME1
     */
    protected CONSUME(tokClass: TokenConstructor): IToken;
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
     * @returns {Token} - The consumed token.
     */
    protected CONSUME1(tokClass: TokenConstructor): IToken;
    /**
     * @see CONSUME1
     */
    protected CONSUME2(tokClass: TokenConstructor): IToken;
    /**
     * @see CONSUME1
     */
    protected CONSUME3(tokClass: TokenConstructor): IToken;
    /**
     * @see CONSUME1
     */
    protected CONSUME4(tokClass: TokenConstructor): IToken;
    /**
     * @see CONSUME1
     */
    protected CONSUME5(tokClass: TokenConstructor): IToken;
    /**
     * Convenience method equivalent to SUBRULE1
     * @see SUBRULE1
     */
    protected SUBRULE<T>(ruleToCall: (a:number) => T, args?: any[]): T;
    /**
     * The Parsing DSL Method is used by one rule to call another.
     *
     * This may seem redundant as it does not actually do much.
     * However using it is mandatory for all sub rule invocations.
     * calling another rule without wrapping in SUBRULE(...)
     * will cause errors/mistakes in the Recognizer's self analysis,
     * which will lead to errors in error recovery/automatic lookahead calculation
     * and any other functionality relying on the Recognizer's self analysis
     * output.
     *
     * As in CONSUME the index in the method name indicates the occurrence
     * of the sub rule invocation in its rule.
     *
     * @param {Function} ruleToCall - The rule to invoke.
     * @param {*[]} args - The arguments to pass to the invoked subrule.
     * @returns {*} - The result of invoking ruleToCall.
     */
    protected SUBRULE1<T>(ruleToCall: (a:number) => T, args?: any[]): T;
    /**
     * @see SUBRULE1
     */
    protected SUBRULE2<T>(ruleToCall: (a:number) => T, args?: any[]): T;
    /**
     * @see SUBRULE1
     */
    protected SUBRULE3<T>(ruleToCall: (a:number) => T, args?: any[]): T;
    /**
     * @see SUBRULE1
     */
    protected SUBRULE4<T>(ruleToCall: (a:number) => T, args?: any[]): T;
    /**
     * @see SUBRULE1
     */
    protected SUBRULE5<T>(ruleToCall: (a:number) => T, args?: any[]): T;
    /**
     * Convenience method equivalent to OPTION1.
     * @see OPTION1
     */
    protected OPTION<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT;
    /**
     * Parsing DSL Method that Indicates an Optional production
     * in EBNF notation: [...].
     *
     * Note that there are two syntax forms:
     * - Passing the grammar action directly:
     *      this.OPTION(()=> {
     *        this.CONSUME(Digit)}
     *      );
     *
     * - using an "options" object:
     *      this.OPTION({
     *        GATE:predicateFunc,
     *        DEF: ()=>{
     *          this.CONSUME(Digit)
     *        }});
     *
     * The optional 'GATE' property in "options" object form can be used to add constraints
     * to invoking the grammar action.
     *
     * As in CONSUME the index in the method name indicates the occurrence
     * of the optional production in it's top rule.
     *
     * @param  actionORMethodDef - The grammar action to optionally invoke once
     *                             or an "OPTIONS" object describing the grammar action and optional properties.
     *
     * @returns {OUT}
     */
    protected OPTION1<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT;
    /**
     * @see OPTION1
     */
    protected OPTION2<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT;
    /**
     * @see OPTION1
     */
    protected OPTION3<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT;
    /**
     * @see OPTION1
     */
    protected OPTION4<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT;
    /**
     * @see OPTION1
     */
    protected OPTION5<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT;
    /**
     * Convenience method equivalent to OR1.
     * @see OR1
     */
    protected OR<T>(altsOrOpts: IAnyOrAlt<T>[] | OrMethodOpts<T>): T;
    /**
     * Parsing DSL method that indicates a choice between a set of alternatives must be made.
     * This is equivalent to EBNF alternation (A | B | C | D ...)
     *
     * There are a couple of syntax forms for the inner alternatives array.
     *
     * Passing alternatives array directly:
     *        this.OR([
     *           {ALT:()=>{this.CONSUME(One)}},
     *           {ALT:()=>{this.CONSUME(Two)}},
     *           {ALT:()=>{this.CONSUME(Three)}}
     *        ])
     *
     * Passing alternative array directly with predicates (GATE).
     *        this.OR([
     *           {GATE: predicateFunc1, ALT:()=>{this.CONSUME(One)}},
     *           {GATE: predicateFuncX, ALT:()=>{this.CONSUME(Two)}},
     *           {GATE: predicateFuncX, ALT:()=>{this.CONSUME(Three)}}
     *        ])
     *
     * These syntax forms can also be mixed:
     *        this.OR([
     *           {GATE: predicateFunc1, ALT:()=>{this.CONSUME(One)}},
     *           {ALT:()=>{this.CONSUME(Two)}},
     *           {ALT:()=>{this.CONSUME(Three)}}
     *        ])
     *
     * Additionally an "options" object may be used:
     * this.OR({
     *          DEF:[
     *            {ALT:()=>{this.CONSUME(One)}},
     *            {ALT:()=>{this.CONSUME(Two)}},
     *            {ALT:()=>{this.CONSUME(Three)}}
     *          ],
     *          // OPTIONAL property
     *          ERR_MSG: "A Number"
     *        })
     *
     * The 'predicateFuncX' in the long form can be used to add constraints to choosing the alternative.
     *
     * As in CONSUME the index in the method name indicates the occurrence
     * of the alternation production in it's top rule.
     *
     * @param altsOrOpts - A set of alternatives or an "OPTIONS" object describing the alternatives and optional properties.
     *
     * @returns {*} - The result of invoking the chosen alternative.
     */
    protected OR1<T>(altsOrOpts: IAnyOrAlt<T>[] | OrMethodOpts<T>): T;
    /**
     * @see OR1
     */
    protected OR2<T>(altsOrOpts: IAnyOrAlt<T>[] | OrMethodOpts<T>): T;
    /**
     * @see OR1
     */
    protected OR3<T>(altsOrOpts: IAnyOrAlt<T>[] | OrMethodOpts<T>): T;
    /**
     * @see OR1
     */
    protected OR4<T>(altsOrOpts: IAnyOrAlt<T>[] | OrMethodOpts<T>): T;
    /**
     * @see OR1
     */
    protected OR5<T>(altsOrOpts: IAnyOrAlt<T>[] | OrMethodOpts<T>): T;
    /**
     * Convenience method equivalent to MANY1.
     * @see MANY1
     */
    protected MANY<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT[];
    /**
     * Parsing DSL method, that indicates a repetition of zero or more.
     * This is equivalent to EBNF repetition {...}.
     *
     * Note that there are two syntax forms:
     * - Passing the grammar action directly:
     *        this.MANY(()=>{
     *                        this.CONSUME(Comma)
     *                        this.CONSUME(Digit)
     *                      })
     *
     * - using an "options" object:
     *        this.MANY({
     *                   GATE: predicateFunc,
     *                   DEF: () => {
     *                          this.CONSUME(Comma)
     *                          this.CONSUME(Digit)
     *                        }
     *                 });
     *
     * The optional 'GATE' property in "options" object form can be used to add constraints
     * to invoking the grammar action.
     *
     * As in CONSUME the index in the method name indicates the occurrence
     * of the repetition production in it's top rule.
     *
     * @param {Function} actionORMethodDef - The grammar action to optionally invoke multiple times
     *                             or an "OPTIONS" object describing the grammar action and optional properties.
     *
     * @returns {OUT[]}
     */
    protected MANY1<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT[];
    /**
     * @see MANY1
     */
    protected MANY2<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT[];
    /**
     * @see MANY1
     */
    protected MANY3<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT[];
    /**
     * @see MANY1
     */
    protected MANY4<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT[];
    /**
     * @see MANY1
     */
    protected MANY5<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOpts<OUT>): OUT[];
    /**
     * Convenience method equivalent to MANY_SEP1.
     * @see MANY_SEP1
     */
    protected MANY_SEP<OUT>(options: ManySepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * Parsing DSL method, that indicates a repetition of zero or more with a separator
     * Token between the repetitions.
     *
     * Example:
     *
     * this.MANY_SEP({
     *                  SEP:Comma,
     *                  DEF: () => {
     *                         this.CONSUME(Number};
     *                         ...
     *                       );
     *              })
     *
     * Note that because this DSL method always requires more than one argument the options object is always required
     * and it is not possible to use a shorter form like in the MANY DSL method.
     *
     * Note that for the purposes of deciding on whether or not another iteration exists
     * Only a single Token is examined (The separator). Therefore if the grammar being implemented is
     * so "crazy" to require multiple tokens to identify an item separator please use the more basic DSL methods
     * to implement it.
     *
     * As in CONSUME the index in the method name indicates the occurrence
     * of the repetition production in it's top rule.
     *
     * Note that due to current limitations in the implementation the "SEP" property must appear BEFORE the "DEF" property.
     *
     * @param options - An object defining the grammar of each iteration and the separator between iterations
     *
     * @return {ISeparatedIterationResult<OUT>}
     */
    protected MANY_SEP1<OUT>(options: ManySepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * @see MANY_SEP1
     */
    protected MANY_SEP2<OUT>(options: ManySepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * @see MANY_SEP1
     */
    protected MANY_SEP3<OUT>(options: ManySepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * @see MANY_SEP1
     */
    protected MANY_SEP4<OUT>(options: ManySepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * @see MANY_SEP1
     */
    protected MANY_SEP5<OUT>(options: ManySepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * Convenience method equivalent to AT_LEAST_ONE1.
     * @see AT_LEAST_ONE1
     */
    protected AT_LEAST_ONE<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOptsWithErr<OUT>): OUT[];
    /**
     * Convenience method, same as MANY but the repetition is of one or more.
     * failing to match at least one repetition will result in a parsing error and
     * cause a parsing error.
     *
     * @see MANY1
     *
     * @param actionORMethodDef  - The grammar action to optionally invoke multiple times
     *                             or an "OPTIONS" object describing the grammar action and optional properties.
     *
     * @return {OUT[]}
     */
    protected AT_LEAST_ONE1<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOptsWithErr<OUT>): OUT[];
    /**
     * @see AT_LEAST_ONE1
     */
    protected AT_LEAST_ONE2<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOptsWithErr<OUT>): OUT[];
    /**
     * @see AT_LEAST_ONE1
     */
    protected AT_LEAST_ONE3<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOptsWithErr<OUT>): OUT[];
    /**
     * @see AT_LEAST_ONE1
     */
    protected AT_LEAST_ONE4<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOptsWithErr<OUT>): OUT[];
    /**
     * @see AT_LEAST_ONE1
     */
    protected AT_LEAST_ONE5<OUT>(actionORMethodDef: GrammarAction<OUT> | DSLMethodOptsWithErr<OUT>): OUT[];
    /**
     * Convenience method equivalent to AT_LEAST_ONE_SEP1.
     * @see AT_LEAST_ONE1
     */
    protected AT_LEAST_ONE_SEP<OUT>(options: AtLeastOneSepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * Convenience method, same as MANY_SEP but the repetition is of one or more.
     * failing to match at least one repetition will result in a parsing error and
     * cause the parser to attempt error recovery.
     *
     * Note that an additional optional property ERR_MSG can be used to provide custom error messages.
     *
     * @see MANY_SEP1
     *
     * @param options - An object defining the grammar of each iteration and the separator between iterations
     *
     * @return {ISeparatedIterationResult<OUT>}
     */
    protected AT_LEAST_ONE_SEP1<OUT>(options: AtLeastOneSepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * @see AT_LEAST_ONE_SEP1
     */
    protected AT_LEAST_ONE_SEP2<OUT>(options: AtLeastOneSepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * @see AT_LEAST_ONE_SEP1
     */
    protected AT_LEAST_ONE_SEP3<OUT>(options: AtLeastOneSepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * @see AT_LEAST_ONE_SEP1
     */
    protected AT_LEAST_ONE_SEP4<OUT>(options: AtLeastOneSepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     * @see AT_LEAST_ONE_SEP1
     */
    protected AT_LEAST_ONE_SEP5<OUT>(options: AtLeastOneSepMethodOpts<OUT>): ISeparatedIterationResult<OUT>;
    /**
     *
     * @param {string} name - The name of the rule.
     * @param {Function} implementation - The implementation of the rule.
     * @param {IRuleConfig} [config] - The rule's optional configuration.
     *
     * @returns {Function} - The parsing rule which is the production implementation wrapped with the parsing logic that handles
     *                     Parser state / error recovery&reporting/ ...
     */
    protected RULE<T>(name: string, implementation: (...implArgs: any[]) => T, config?: IRuleConfig<T>): (idxInCallingRule?: number, ...args: any[]) => T | any;
    /**
     * @See RULE
     * Same as RULE, but should only be used in "extending" grammars to override rules/productions
     * from the super grammar.
     */
    protected OVERRIDE_RULE<T>(name: string, impl: (...implArgs: any[]) => T, config?: IRuleConfig<T>): (idxInCallingRule?: number, ...args: any[]) => T;
    protected ruleInvocationStateUpdate(shortName: string, fullName: string, idxInCallingRule: number): void;
    protected ruleFinallyStateUpdate(): void;
    protected nestedRuleInvocationStateUpdate(nestedRuleName: string, shortNameKey: number): void;
    protected nestedRuleFinallyStateUpdate(): void;
    /**
     * Returns an "imaginary" Token to insert when Single Token Insertion is done
     * Override this if you require special behavior in your grammar.
     * For example if an IntegerToken is required provide one with the image '0' so it would be valid syntactically.
     */
    protected getTokenToInsert(tokClass: TokenConstructor): IToken;
    /**
     * By default all tokens type may be inserted. This behavior may be overridden in inheriting Recognizers
     * for example: One may decide that only punctuation tokens may be inserted automatically as they have no additional
     * semantic value. (A mandatory semicolon has no additional semantic meaning, but an Integer may have additional meaning
     * depending on its int value and context (Inserting an integer 0 in cardinality: "[1..]" will cause semantic issues
     * as the max of the cardinality will be greater than the min value (and this is a false error!).
     */
    protected canTokenTypeBeInsertedInRecovery(tokClass: TokenConstructor): boolean;
    /**
     * @param {Token} actualToken - The actual unexpected (mismatched) Token instance encountered.
     * @param {Function} expectedTokType - The Class of the expected Token.
     * @returns {string} - The error message saved as part of a MismatchedTokenException.
     */
    protected getMisMatchTokenErrorMessage(expectedTokType: TokenConstructor, actualToken: IToken): string;
    protected getCurrentGrammarPath(tokClass: TokenConstructor, tokIdxInRule: number): ITokenGrammarPath;
    protected getNextPossibleTokenTypes(grammarPath: ITokenGrammarPath): TokenConstructor[];
    protected subruleInternal<T>(ruleToCall: (a:number) => T, idx: any, args: any[]): any;
    /**
     * @param tokClass - The Type of Token we wish to consume (Reference to its constructor function).
     * @param idx - Occurrence index of consumed token in the invoking parser rule text
     *         for example:
     *         IDENT (DOT IDENT)*
     *         the first ident will have idx 1 and the second one idx 2
     *         * note that for the second ident the idx is always 2 even if its invoked 30 times in the same rule
     *           the idx is about the position in grammar (source code) and has nothing to do with a specific invocation
     *           details.
     *
     * @returns {Token} - The consumed Token.
     */
    protected consumeInternal(tokClass: TokenConstructor, idx: number): IToken;
    protected consumeInternalWithTryCatch(tokClass: TokenConstructor, idx: number): IToken;
    /**
     * Convenience method equivalent to LA(1)
     * It is no longer used directly in chevrotain due to
     * performance considerations (avoid the need for inlining optimizations).
     *
     * But it is maintained for backward compatibility reasons.
     *
     * @deprecated
     */
    protected NEXT_TOKEN(): IToken;
    protected LA(howMuch: number): IToken;
    protected consumeToken(): void;
    protected saveLexerState(): void;
    protected restoreLexerState(): void;
    protected resetLexerState(): void;
    protected moveLexerStateToEnd(): void;
                                                                                                                                                                                                                                                                        }

    export declare type CstElement = IToken | CstNode;
export declare type CstChildrenDictionary = {
    [identifier: string]: CstElement[];
};
/**
 * A Concrete Syntax Tree Node.
 * This structure represents the whole parse tree of the grammar
 * This means that information on each and every Token is present.
 * This is unlike an AST (Abstract Syntax Tree) where some of the syntactic information is missing.
 *
 * For example given an ECMAScript grammar, an AST would normally not contain information on the location
 * of Commas, Semi colons, redundant parenthesis ect, however a CST would have that information.
 */
export interface CstNode {
    readonly name: string;
    readonly children: CstChildrenDictionary;
    readonly recoveredNode?: boolean;
    /**
     * Only for "in-lined" rules, the name of the top level rule containing this nested rule
     */
    readonly fullName?: string;
}
export interface ICstVisitor<IN, OUT> {
    visit(cstNode: CstNode | CstNode[], param?: IN): OUT;
    validateVisitor(): void;
}
export interface CstVisitorConstructor extends Function {
    new <IN, OUT>(...args: any[]): ICstVisitor<IN, OUT>;
}

    export declare namespace exceptions {
    interface IRecognizerContext {
        /**
         * A copy of the parser's rule stack at the "time" the RecognitionException occurred.
         * This can be used to help debug parsing errors (How did we get here?).
         */
        ruleStack: string[];
        /**
         * A copy of the parser's rule occurrence stack at the "time" the RecognitionException occurred.
         * This can be used to help debug parsing errors (How did we get here?).
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
    function MismatchedTokenException(message: string, token: IToken): void;
    function NoViableAltException(message: string, token: IToken): void;
    function NotAllInputParsedException(message: string, token: IToken): void;
    function EarlyExitException(message: string, token: IToken): void;
}

    /**
 * this interfaces defines the path the parser "took" to reach a certain position
 * in the grammar.
 */
export interface IGrammarPath {
    /**
     * The Grammar rules invoked and still unterminated to reach this Grammar Path.
     */
    ruleStack: string[];
    /**
     * The occurrence index (SUBRULE1/2/3/5/...) of each Grammar rule invoked and still unterminated.
     * Used to distinguish between two invocations of the same subrule at the same top level rule.
     * Example: (QualifiedName: SUBRULE1(Identifier) (DOT SUBRULE2(Identifier))*
     */
    occurrenceStack: number[];
}
export interface ITokenGrammarPath extends IGrammarPath {
    lastTok: Function;
    lastTokOccurrence: number;
}
export interface ISyntacticContentAssistPath extends IGrammarPath {
    nextTokenType: TokenConstructor;
    nextTokenOccurrence: number;
}
export interface IRuleGrammarPath extends IGrammarPath {
    occurrence: number;
}

    export declare namespace gast {
    interface INamedProductionConstructor extends Function {
        new (definition: IProduction[], occurrenceInParent: number, name?: string): AbstractProduction;
    }
    interface INamedSepProductionConstructor extends Function {
        new (definition: IProduction[], separator: TokenConstructor, occurrenceInParent: number, name?: string): AbstractProduction;
    }
    interface IOptionallyNamedProduction {
        name?: string;
    }
    interface IProduction {
        accept(visitor: GAstVisitor): void;
    }
    interface IProductionWithOccurrence extends IProduction {
        occurrenceInParent: number;
        implicitOccurrenceIndex: boolean;
    }
    abstract class AbstractProduction implements IProduction {
        definition: IProduction[];
        constructor(definition: IProduction[]);
        accept(visitor: GAstVisitor): void;
    }
    class NonTerminal extends AbstractProduction implements IProductionWithOccurrence {
        nonTerminalName: string;
        referencedRule: Rule;
        occurrenceInParent: number;
        implicitOccurrenceIndex: boolean;
        constructor(nonTerminalName: string, referencedRule?: Rule, occurrenceInParent?: number, implicitOccurrenceIndex?: boolean);
        definition: IProduction[];
        accept(visitor: GAstVisitor): void;
    }
    class Rule extends AbstractProduction {
        name: string;
        orgText: string;
        constructor(name: string, definition: IProduction[], orgText?: string);
    }
    class Flat extends AbstractProduction implements IOptionallyNamedProduction {
        name: string;
        constructor(definition: IProduction[], name?: string);
    }
    class Option extends AbstractProduction implements IProductionWithOccurrence, IOptionallyNamedProduction {
        occurrenceInParent: number;
        name: string;
        implicitOccurrenceIndex: boolean;
        constructor(definition: IProduction[], occurrenceInParent?: number, name?: string, implicitOccurrenceIndex?: boolean);
    }
    class RepetitionMandatory extends AbstractProduction implements IProductionWithOccurrence, IOptionallyNamedProduction {
        occurrenceInParent: number;
        name: string;
        implicitOccurrenceIndex: boolean;
        constructor(definition: IProduction[], occurrenceInParent?: number, name?: string, implicitOccurrenceIndex?: boolean);
    }
    class RepetitionMandatoryWithSeparator extends AbstractProduction implements IProductionWithOccurrence, IOptionallyNamedProduction {
        separator: TokenConstructor;
        occurrenceInParent: number;
        name: string;
        implicitOccurrenceIndex: boolean;
        constructor(definition: IProduction[], separator: TokenConstructor, occurrenceInParent?: number, name?: string, implicitOccurrenceIndex?: boolean);
    }
    class Repetition extends AbstractProduction implements IProductionWithOccurrence, IOptionallyNamedProduction {
        occurrenceInParent: number;
        name: string;
        implicitOccurrenceIndex: boolean;
        constructor(definition: IProduction[], occurrenceInParent?: number, name?: string, implicitOccurrenceIndex?: boolean);
    }
    class RepetitionWithSeparator extends AbstractProduction implements IProductionWithOccurrence, IOptionallyNamedProduction {
        separator: TokenConstructor;
        occurrenceInParent: number;
        name: string;
        implicitOccurrenceIndex: boolean;
        constructor(definition: IProduction[], separator: TokenConstructor, occurrenceInParent?: number, name?: string, implicitOccurrenceIndex?: boolean);
    }
    class Alternation extends AbstractProduction implements IProductionWithOccurrence, IOptionallyNamedProduction {
        occurrenceInParent: number;
        name: string;
        implicitOccurrenceIndex: boolean;
        constructor(definition: Flat[], occurrenceInParent?: number, name?: string, implicitOccurrenceIndex?: boolean);
    }
    class Terminal implements IProductionWithOccurrence {
        terminalType: TokenConstructor;
        occurrenceInParent: number;
        implicitOccurrenceIndex: boolean;
        constructor(terminalType: TokenConstructor, occurrenceInParent?: number, implicitOccurrenceIndex?: boolean);
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
    interface ISerializedGast {
        type: "NonTerminal" | "Flat" | "Option" | "RepetitionMandatory" | "RepetitionMandatoryWithSeparator" | "Repetition" | "RepetitionWithSeparator" | "Alternation" | "Terminal" | "Rule";
        definition?: ISerializedGast[];
    }
    interface ISerializedGastRule extends ISerializedGast {
        name: string;
    }
    interface ISerializedNonTerminal extends ISerializedGast {
        name: string;
        occurrenceInParent: number;
    }
    interface ISerializedTerminal extends ISerializedGast {
        name: string;
        label?: string;
        pattern?: string;
        occurrenceInParent: number;
    }
    interface ISerializedTerminalWithSeparator extends ISerializedGast {
        separator: ISerializedTerminal;
    }
    function serializeGrammar(topRules: Rule[]): ISerializedGast[];
    function serializeProduction(node: IProduction): ISerializedGast;
}

    /**
 * Clears the chevrotain internal cache.
 * This should not be used in regular work flows, This is intended for
 * unique use cases for example: online playground where the a parser with the same name is initialized with
 * different implementations multiple times.
 */
export declare function clearCache(): void;

