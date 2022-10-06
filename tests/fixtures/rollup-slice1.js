const relativeUrlMechanisms = {
    amd: relativePath => {
        if (relativePath[0] !== '.')
            relativePath = './' + relativePath;
        return getResolveUrl(`require.toUrl('${relativePath}'), document.baseURI`);
    },
    cjs: relativePath => `(typeof document === 'undefined' ? ${getResolveUrl(`'file:' + __dirname + '/${relativePath}'`, `(require('u' + 'rl').URL)`)} : ${getRelativeUrlFromDocument(relativePath)})`,
    es: relativePath => getResolveUrl(`'${relativePath}', import.meta.url`),
    iife: relativePath => getRelativeUrlFromDocument(relativePath),
    system: relativePath => getResolveUrl(`'${relativePath}', module.meta.url`),
    umd: relativePath => `(typeof document === 'undefined' ? ${getResolveUrl(`'file:' + __dirname + '/${relativePath}'`, `(require('u' + 'rl').URL)`)} : ${getRelativeUrlFromDocument(relativePath)})`
};
const importMetaMechanisms = {
    amd: getGenericImportMetaMechanism(() => getResolveUrl(`module.uri, document.baseURI`)),
    cjs: getGenericImportMetaMechanism(chunkId => `(typeof document === 'undefined' ? ${getResolveUrl(`'file:' + __filename`, `(require('u' + 'rl').URL)`)} : ${getUrlFromDocument(chunkId)})`),
    iife: getGenericImportMetaMechanism(chunkId => getUrlFromDocument(chunkId)),
    system: prop => (prop === null ? `module.meta` : `module.meta.${prop}`),
    umd: getGenericImportMetaMechanism(chunkId => `(typeof document === 'undefined' ? ${getResolveUrl(`'file:' + __filename`, `(require('u' + 'rl').URL)`)} : ${getUrlFromDocument(chunkId)})`)
};

class MethodDefinition extends NodeBase {
    hasEffects(context) {
        return this.key.hasEffects(context);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        return (path.length > 0 || this.value.hasEffectsWhenCalledAtPath(EMPTY_PATH, callOptions, context));
    }
}

class NewExpression extends NodeBase {
    bind() {
        super.bind();
        for (const argument of this.arguments) {
            // This will make sure all properties of parameters behave as "unknown"
            argument.deoptimizePath(UNKNOWN_PATH);
        }
    }
    hasEffects(context) {
        for (const argument of this.arguments) {
            if (argument.hasEffects(context))
                return true;
        }
        if (this.context.annotations && this.annotatedPure)
            return false;
        return (this.callee.hasEffects(context) ||
            this.callee.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.callOptions, context));
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    initialise() {
        this.callOptions = {
            args: this.arguments,
            withNew: true
        };
    }
}

class SpreadElement extends NodeBase {
    bind() {
        super.bind();
        // Only properties of properties of the argument could become subject to reassignment
        // This will also reassign the return values of iterators
        this.argument.deoptimizePath([UnknownKey, UnknownKey]);
    }
}

class ObjectExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.deoptimizedPaths = new Set();
        // We collect deoptimization information if we can resolve a computed property access
        this.expressionsToBeDeoptimized = new Map();
        this.hasUnknownDeoptimizedProperty = false;
        this.propertyMap = null;
        this.unmatchablePropertiesRead = [];
        this.unmatchablePropertiesWrite = [];
    }
    bind() {
        super.bind();
        // ensure the propertyMap is set for the tree-shaking passes
        this.getPropertyMap();
    }
    // We could also track this per-property but this would quickly become much more complex
    deoptimizeCache() {
        if (!this.hasUnknownDeoptimizedProperty)
            this.deoptimizeAllProperties();
    }
    deoptimizePath(path) {
        if (this.hasUnknownDeoptimizedProperty)
            return;
        const propertyMap = this.getPropertyMap();
        const key = path[0];
        if (path.length === 1) {
            if (typeof key !== 'string') {
                this.deoptimizeAllProperties();
                return;
            }
            if (!this.deoptimizedPaths.has(key)) {
                this.deoptimizedPaths.add(key);
                // we only deoptimizeCache exact matches as in all other cases,
                // we do not return a literal value or return expression
                const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized.get(key);
                if (expressionsToBeDeoptimized) {
                    for (const expression of expressionsToBeDeoptimized) {
                        expression.deoptimizeCache();
                    }
                }
            }
        }
        const subPath = path.length === 1 ? UNKNOWN_PATH : path.slice(1);
        for (const property of typeof key === 'string'
            ? propertyMap[key]
                ? propertyMap[key].propertiesRead
                : []
            : this.properties) {
            property.deoptimizePath(subPath);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        const propertyMap = this.getPropertyMap();
        const key = path[0];
        if (path.length === 0 ||
            this.hasUnknownDeoptimizedProperty ||
            typeof key !== 'string' ||
            this.deoptimizedPaths.has(key))
            return UnknownValue;
        if (path.length === 1 &&
            !propertyMap[key] &&
            !objectMembers[key] &&
            this.unmatchablePropertiesRead.length === 0) {
            const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized.get(key);
            if (expressionsToBeDeoptimized) {
                expressionsToBeDeoptimized.push(origin);
            }
            else {
                this.expressionsToBeDeoptimized.set(key, [origin]);
            }
            return undefined;
        }
        if (!propertyMap[key] ||
            propertyMap[key].exactMatchRead === null ||
            propertyMap[key].propertiesRead.length > 1) {
            return UnknownValue;
        }
        const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized.get(key);
        if (expressionsToBeDeoptimized) {
            expressionsToBeDeoptimized.push(origin);
        }
        else {
            this.expressionsToBeDeoptimized.set(key, [origin]);
        }
        return propertyMap[key].exactMatchRead.getLiteralValueAtPath(path.slice(1), recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        const propertyMap = this.getPropertyMap();
        const key = path[0];
        if (path.length === 0 ||
            this.hasUnknownDeoptimizedProperty ||
            typeof key !== 'string' ||
            this.deoptimizedPaths.has(key))
            return UNKNOWN_EXPRESSION;
        if (path.length === 1 &&
            objectMembers[key] &&
            this.unmatchablePropertiesRead.length === 0 &&
            (!propertyMap[key] || propertyMap[key].exactMatchRead === null))
            return getMemberReturnExpressionWhenCalled(objectMembers, key);
        if (!propertyMap[key] ||
            propertyMap[key].exactMatchRead === null ||
            propertyMap[key].propertiesRead.length > 1)
            return UNKNOWN_EXPRESSION;
        const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized.get(key);
        if (expressionsToBeDeoptimized) {
            expressionsToBeDeoptimized.push(origin);
        }
        else {
            this.expressionsToBeDeoptimized.set(key, [origin]);
        }
        return propertyMap[key].exactMatchRead.getReturnExpressionWhenCalledAtPath(path.slice(1), recursionTracker, origin);
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        if (path.length === 0)
            return false;
        const key = path[0];
        const propertyMap = this.propertyMap;
        if (path.length > 1 &&
            (this.hasUnknownDeoptimizedProperty ||
                typeof key !== 'string' ||
                this.deoptimizedPaths.has(key) ||
                !propertyMap[key] ||
                propertyMap[key].exactMatchRead === null))
            return true;
        const subPath = path.slice(1);
        for (const property of typeof key !== 'string'
            ? this.properties
            : propertyMap[key]
                ? propertyMap[key].propertiesRead
                : []) {
            if (property.hasEffectsWhenAccessedAtPath(subPath, context))
                return true;
        }
        return false;
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        const key = path[0];
        const propertyMap = this.propertyMap;
        if (path.length > 1 &&
            (this.hasUnknownDeoptimizedProperty ||
                this.deoptimizedPaths.has(key) ||
                !propertyMap[key] ||
                propertyMap[key].exactMatchRead === null)) {
            return true;
        }
        const subPath = path.slice(1);
        for (const property of typeof key !== 'string'
            ? this.properties
            : path.length > 1
                ? propertyMap[key].propertiesRead
                : propertyMap[key]
                    ? propertyMap[key].propertiesWrite
                    : []) {
            if (property.hasEffectsWhenAssignedAtPath(subPath, context))
                return true;
        }
        return false;
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        const key = path[0];
        if (typeof key !== 'string' ||
            this.hasUnknownDeoptimizedProperty ||
            this.deoptimizedPaths.has(key) ||
            (this.propertyMap[key]
                ? !this.propertyMap[key].exactMatchRead
                : path.length > 1 || !objectMembers[key])) {
            return true;
        }
        const subPath = path.slice(1);
        if (this.propertyMap[key]) {
            for (const property of this.propertyMap[key].propertiesRead) {
                if (property.hasEffectsWhenCalledAtPath(subPath, callOptions, context))
                    return true;
            }
        }
        if (path.length === 1 && objectMembers[key])
            return hasMemberEffectWhenCalled(objectMembers, key, this.included, callOptions, context);
        return false;
    }
    render(code, options, { renderedParentType } = BLANK) {
        super.render(code, options);
        if (renderedParentType === ExpressionStatement ||
            renderedParentType === ArrowFunctionExpression) {
            code.appendRight(this.start, '(');
            code.prependLeft(this.end, ')');
        }
    }
    deoptimizeAllProperties() {
        this.hasUnknownDeoptimizedProperty = true;
        for (const property of this.properties) {
            property.deoptimizePath(UNKNOWN_PATH);
        }
        for (const expressionsToBeDeoptimized of this.expressionsToBeDeoptimized.values()) {
            for (const expression of expressionsToBeDeoptimized) {
                expression.deoptimizeCache();
            }
        }
    }
    getPropertyMap() {
        if (this.propertyMap !== null) {
            return this.propertyMap;
        }
        const propertyMap = (this.propertyMap = Object.create(null));
        for (let index = this.properties.length - 1; index >= 0; index--) {
            const property = this.properties[index];
            if (property instanceof SpreadElement) {
                this.unmatchablePropertiesRead.push(property);
                continue;
            }
            const isWrite = property.kind !== 'get';
            const isRead = property.kind !== 'set';
            let key;
            if (property.computed) {
                const keyValue = property.key.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this);
                if (keyValue === UnknownValue) {
                    if (isRead) {
                        this.unmatchablePropertiesRead.push(property);
                    }
                    else {
                        this.unmatchablePropertiesWrite.push(property);
                    }
                    continue;
                }
                key = String(keyValue);
            }
            else if (property.key instanceof Identifier$1) {
                key = property.key.name;
            }
            else {
                key = String(property.key.value);
            }
            const propertyMapProperty = propertyMap[key];
            if (!propertyMapProperty) {
                propertyMap[key] = {
                    exactMatchRead: isRead ? property : null,
                    exactMatchWrite: isWrite ? property : null,
                    propertiesRead: isRead ? [property, ...this.unmatchablePropertiesRead] : [],
                    propertiesWrite: isWrite && !isRead ? [property, ...this.unmatchablePropertiesWrite] : []
                };
                continue;
            }
            if (isRead && propertyMapProperty.exactMatchRead === null) {
                propertyMapProperty.exactMatchRead = property;
                propertyMapProperty.propertiesRead.push(property, ...this.unmatchablePropertiesRead);
            }
            if (isWrite && !isRead && propertyMapProperty.exactMatchWrite === null) {
                propertyMapProperty.exactMatchWrite = property;
                propertyMapProperty.propertiesWrite.push(property, ...this.unmatchablePropertiesWrite);
            }
        }
        return propertyMap;
    }
}

class ObjectPattern extends NodeBase {
    addExportedVariables(variables) {
        for (const property of this.properties) {
            if (property.type === Property) {
                property.value.addExportedVariables(variables);
            }
            else {
                property.argument.addExportedVariables(variables);
            }
        }
    }
    declare(kind, init) {
        const variables = [];
        for (const property of this.properties) {
            variables.push(...property.declare(kind, init));
        }
        return variables;
    }
    deoptimizePath(path) {
        if (path.length === 0) {
            for (const property of this.properties) {
                property.deoptimizePath(path);
            }
        }
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (path.length > 0)
            return true;
        for (const property of this.properties) {
            if (property.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context))
                return true;
        }
        return false;
    }
}

class PrivateName extends NodeBase {
}

class Program$1 extends NodeBase {
    constructor() {
        super(...arguments);
        this.hasCachedEffect = false;
    }
    hasEffects(context) {
        // We are caching here to later more efficiently identify side-effect-free modules
        if (this.hasCachedEffect)
            return true;
        for (const node of this.body) {
            if (node.hasEffects(context)) {
                return (this.hasCachedEffect = true);
            }
        }
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        for (const node of this.body) {
            if (includeChildrenRecursively || node.shouldBeIncluded(context)) {
                node.include(context, includeChildrenRecursively);
            }
        }
    }
    render(code, options) {
        if (this.body.length) {
            renderStatementList(this.body, code, this.start, this.end, options);
        }
        else {
            super.render(code, options);
        }
    }
}

class Property$1 extends NodeBase {
    constructor() {
        super(...arguments);
        this.declarationInit = null;
        this.returnExpression = null;
    }
    bind() {
        super.bind();
        if (this.kind === 'get') {
            // ensure the returnExpression is set for the tree-shaking passes
            this.getReturnExpression();
        }
        if (this.declarationInit !== null) {
            this.declarationInit.deoptimizePath([UnknownKey, UnknownKey]);
        }
    }
    declare(kind, init) {
        this.declarationInit = init;
        return this.value.declare(kind, UNKNOWN_EXPRESSION);
    }
    // As getter properties directly receive their values from function expressions that always
    // have a fixed return value, there is no known situation where a getter is deoptimized.
    deoptimizeCache() { }
    deoptimizePath(path) {
        if (this.kind === 'get') {
            this.getReturnExpression().deoptimizePath(path);
        }
        else {
            this.value.deoptimizePath(path);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (this.kind === 'get') {
            return this.getReturnExpression().getLiteralValueAtPath(path, recursionTracker, origin);
        }
        return this.value.getLiteralValueAtPath(path, recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin) {
        if (this.kind === 'get') {
            return this.getReturnExpression().getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
        }
        return this.value.getReturnExpressionWhenCalledAtPath(path, recursionTracker, origin);
    }
    hasEffects(context) {
        return this.key.hasEffects(context) || this.value.hasEffects(context);
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        if (this.kind === 'get') {
            const trackedExpressions = context.accessed.getEntities(path);
            if (trackedExpressions.has(this))
                return false;
            trackedExpressions.add(this);
            return (this.value.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.accessorCallOptions, context) ||
                (path.length > 0 && this.returnExpression.hasEffectsWhenAccessedAtPath(path, context)));
        }
        return this.value.hasEffectsWhenAccessedAtPath(path, context);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        if (this.kind === 'get') {
            const trackedExpressions = context.assigned.getEntities(path);
            if (trackedExpressions.has(this))
                return false;
            trackedExpressions.add(this);
            return this.returnExpression.hasEffectsWhenAssignedAtPath(path, context);
        }
        if (this.kind === 'set') {
            const trackedExpressions = context.assigned.getEntities(path);
            if (trackedExpressions.has(this))
                return false;
            trackedExpressions.add(this);
            return this.value.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.accessorCallOptions, context);
        }
        return this.value.hasEffectsWhenAssignedAtPath(path, context);
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        if (this.kind === 'get') {
            const trackedExpressions = (callOptions.withNew
                ? context.instantiated
                : context.called).getEntities(path, callOptions);
            if (trackedExpressions.has(this))
                return false;
            trackedExpressions.add(this);
            return this.returnExpression.hasEffectsWhenCalledAtPath(path, callOptions, context);
        }
        return this.value.hasEffectsWhenCalledAtPath(path, callOptions, context);
    }
    initialise() {
        this.accessorCallOptions = {
            args: NO_ARGS,
            withNew: false
        };
    }
    render(code, options) {
        if (!this.shorthand) {
            this.key.render(code, options);
        }
        this.value.render(code, options, { isShorthandProperty: this.shorthand });
    }
    getReturnExpression() {
        if (this.returnExpression === null) {
            this.returnExpression = UNKNOWN_EXPRESSION;
            return (this.returnExpression = this.value.getReturnExpressionWhenCalledAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this));
        }
        return this.returnExpression;
    }
}

class ReturnStatement$1 extends NodeBase {
    hasEffects(context) {
        if (!context.ignore.returnAwaitYield ||
            (this.argument !== null && this.argument.hasEffects(context)))
            return true;
        context.brokenFlow = BROKEN_FLOW_ERROR_RETURN_LABEL;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (this.argument) {
            this.argument.include(context, includeChildrenRecursively);
        }
        context.brokenFlow = BROKEN_FLOW_ERROR_RETURN_LABEL;
    }
    initialise() {
        this.scope.addReturnExpression(this.argument || UNKNOWN_EXPRESSION);
    }
    render(code, options) {
        if (this.argument) {
            this.argument.render(code, options, { preventASI: true });
            if (this.argument.start === this.start + 6 /* 'return'.length */) {
                code.prependLeft(this.start + 6, ' ');
            }
        }
    }
}

class SequenceExpression extends NodeBase {
    deoptimizePath(path) {
        if (path.length > 0)
            this.expressions[this.expressions.length - 1].deoptimizePath(path);
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        return this.expressions[this.expressions.length - 1].getLiteralValueAtPath(path, recursionTracker, origin);
    }
    hasEffects(context) {
        for (const expression of this.expressions) {
            if (expression.hasEffects(context))
                return true;
        }
        return false;
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        return (path.length > 0 &&
            this.expressions[this.expressions.length - 1].hasEffectsWhenAccessedAtPath(path, context));
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        return (path.length === 0 ||
            this.expressions[this.expressions.length - 1].hasEffectsWhenAssignedAtPath(path, context));
    }
    hasEffectsWhenCalledAtPath(path, callOptions, context) {
        return this.expressions[this.expressions.length - 1].hasEffectsWhenCalledAtPath(path, callOptions, context);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        for (let i = 0; i < this.expressions.length - 1; i++) {
            const node = this.expressions[i];
            if (includeChildrenRecursively || node.shouldBeIncluded(context))
                node.include(context, includeChildrenRecursively);
        }
        this.expressions[this.expressions.length - 1].include(context, includeChildrenRecursively);
    }
    render(code, options, { renderedParentType, isCalleeOfRenderedParent, preventASI } = BLANK) {
        let includedNodes = 0;
        for (const { node, start, end } of getCommaSeparatedNodesWithBoundaries(this.expressions, code, this.start, this.end)) {
            if (!node.included) {
                treeshakeNode(node, code, start, end);
                continue;
            }
            includedNodes++;
            if (includedNodes === 1 && preventASI) {
                removeLineBreaks(code, start, node.start);
            }
            if (node === this.expressions[this.expressions.length - 1] && includedNodes === 1) {
                node.render(code, options, {
                    isCalleeOfRenderedParent: renderedParentType
                        ? isCalleeOfRenderedParent
                        : this.parent.callee === this,
                    renderedParentType: renderedParentType || this.parent.type
                });
            }
            else {
                node.render(code, options);
            }
        }
    }
}

class Super extends NodeBase {
}

class SwitchCase extends NodeBase {
    hasEffects(context) {
        if (this.test && this.test.hasEffects(context))
            return true;
        for (const node of this.consequent) {
            if (context.brokenFlow)
                break;
            if (node.hasEffects(context))
                return true;
        }
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (this.test)
            this.test.include(context, includeChildrenRecursively);
        for (const node of this.consequent) {
            if (includeChildrenRecursively || node.shouldBeIncluded(context))
                node.include(context, includeChildrenRecursively);
        }
    }
    render(code, options, nodeRenderOptions) {
        if (this.consequent.length) {
            this.test && this.test.render(code, options);
            const testEnd = this.test
                ? this.test.end
                : findFirstOccurrenceOutsideComment(code.original, 'default', this.start) + 7;
            const consequentStart = findFirstOccurrenceOutsideComment(code.original, ':', testEnd) + 1;
            renderStatementList(this.consequent, code, consequentStart, nodeRenderOptions.end, options);
        }
        else {
            super.render(code, options);
        }
    }
}
SwitchCase.prototype.needsBoundaries = true;

class SwitchStatement extends NodeBase {
    createScope(parentScope) {
        this.scope = new BlockScope(parentScope);
    }
    hasEffects(context) {
        if (this.discriminant.hasEffects(context))
            return true;
        const { brokenFlow, ignore: { breaks } } = context;
        let minBrokenFlow = Infinity;
        context.ignore.breaks = true;
        for (const switchCase of this.cases) {
            if (switchCase.hasEffects(context))
                return true;
            minBrokenFlow = context.brokenFlow < minBrokenFlow ? context.brokenFlow : minBrokenFlow;
            context.brokenFlow = brokenFlow;
        }
        if (this.defaultCase !== null && !(minBrokenFlow === BROKEN_FLOW_BREAK_CONTINUE)) {
            context.brokenFlow = minBrokenFlow;
        }
        context.ignore.breaks = breaks;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.discriminant.include(context, includeChildrenRecursively);
        const { brokenFlow } = context;
        let minBrokenFlow = Infinity;
        let isCaseIncluded = includeChildrenRecursively ||
            (this.defaultCase !== null && this.defaultCase < this.cases.length - 1);
        for (let caseIndex = this.cases.length - 1; caseIndex >= 0; caseIndex--) {
            const switchCase = this.cases[caseIndex];
            if (switchCase.included) {
                isCaseIncluded = true;
            }
            if (!isCaseIncluded) {
                const hasEffectsContext = createHasEffectsContext();
                hasEffectsContext.ignore.breaks = true;
                isCaseIncluded = switchCase.hasEffects(hasEffectsContext);
            }
            if (isCaseIncluded) {
                switchCase.include(context, includeChildrenRecursively);
                minBrokenFlow = minBrokenFlow < context.brokenFlow ? minBrokenFlow : context.brokenFlow;
                context.brokenFlow = brokenFlow;
            }
            else {
                minBrokenFlow = brokenFlow;
            }
        }
        if (isCaseIncluded &&
            this.defaultCase !== null &&
            !(minBrokenFlow === BROKEN_FLOW_BREAK_CONTINUE)) {
            context.brokenFlow = minBrokenFlow;
        }
    }
    initialise() {
        for (let caseIndex = 0; caseIndex < this.cases.length; caseIndex++) {
            if (this.cases[caseIndex].test === null) {
                this.defaultCase = caseIndex;
                return;
            }
        }
        this.defaultCase = null;
    }
    render(code, options) {
        this.discriminant.render(code, options);
        if (this.cases.length > 0) {
            renderStatementList(this.cases, code, this.cases[0].start, this.end - 1, options);
        }
    }
}

class TaggedTemplateExpression extends NodeBase {
    bind() {
        super.bind();
        if (this.tag.type === Identifier) {
            const name = this.tag.name;
            const variable = this.scope.findVariable(name);
            if (variable.isNamespace) {
                this.context.warn({
                    code: 'CANNOT_CALL_NAMESPACE',
                    message: `Cannot call a namespace ('${name}')`,
                }, this.start);
            }
            if (name === 'eval') {
                this.context.warn({
                    code: 'EVAL',
                    message: `Use of eval is strongly discouraged, as it poses security risks and may cause issues with minification`,
                    url: 'https://rollupjs.org/guide/en/#avoiding-eval',
                }, this.start);
            }
        }
    }
    hasEffects(context) {
        return (super.hasEffects(context) ||
            this.tag.hasEffectsWhenCalledAtPath(EMPTY_PATH, this.callOptions, context));
    }
    initialise() {
        this.callOptions = {
            args: NO_ARGS,
            withNew: false,
        };
    }
}

class TemplateElement extends NodeBase {
    bind() { }
    hasEffects() {
        return false;
    }
    include() {
        this.included = true;
    }
    parseNode(esTreeNode) {
        this.value = esTreeNode.value;
        super.parseNode(esTreeNode);
    }
    render() { }
}

class TemplateLiteral extends NodeBase {
    getLiteralValueAtPath(path) {
        if (path.length > 0 || this.quasis.length !== 1) {
            return UnknownValue;
        }
        return this.quasis[0].value.cooked;
    }
    render(code, options) {
        code.indentExclusionRanges.push([this.start, this.end]);
        super.render(code, options);
    }
}

class ModuleScope extends ChildScope {
    constructor(parent, context) {
        super(parent);
        this.context = context;
        this.variables.set('this', new LocalVariable('this', null, UNDEFINED_EXPRESSION, context));
    }
    addExportDefaultDeclaration(name, exportDefaultDeclaration, context) {
        const variable = new ExportDefaultVariable(name, exportDefaultDeclaration, context);
        this.variables.set('default', variable);
        return variable;
    }
    addNamespaceMemberAccess(_name, variable) {
        if (variable instanceof GlobalVariable) {
            this.accessedOutsideVariables.set(variable.name, variable);
        }
    }
    deconflict(format) {
        // all module level variables are already deconflicted when deconflicting the chunk
        for (const scope of this.children)
            scope.deconflict(format);
    }
    findLexicalBoundary() {
        return this;
    }
    findVariable(name) {
        const knownVariable = this.variables.get(name) || this.accessedOutsideVariables.get(name);
        if (knownVariable) {
            return knownVariable;
        }
        const variable = this.context.traceVariable(name) || this.parent.findVariable(name);
        if (variable instanceof GlobalVariable) {
            this.accessedOutsideVariables.set(name, variable);
        }
        return variable;
    }
}

class ThisExpression extends NodeBase {
    bind() {
        super.bind();
        this.variable = this.scope.findVariable('this');
    }
    hasEffectsWhenAccessedAtPath(path, context) {
        return path.length > 0 && this.variable.hasEffectsWhenAccessedAtPath(path, context);
    }
    hasEffectsWhenAssignedAtPath(path, context) {
        return this.variable.hasEffectsWhenAssignedAtPath(path, context);
    }
    initialise() {
        this.alias =
            this.scope.findLexicalBoundary() instanceof ModuleScope ? this.context.moduleContext : null;
        if (this.alias === 'undefined') {
            this.context.warn({
                code: 'THIS_IS_UNDEFINED',
                message: `The 'this' keyword is equivalent to 'undefined' at the top level of an ES module, and has been rewritten`,
                url: `https://rollupjs.org/guide/en/#error-this-is-undefined`
            }, this.start);
        }
    }
    render(code) {
        if (this.alias !== null) {
            code.overwrite(this.start, this.end, this.alias, {
                contentOnly: false,
                storeName: true
            });
        }
    }
}

class ThrowStatement extends NodeBase {
    hasEffects() {
        return true;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.argument.include(context, includeChildrenRecursively);
        context.brokenFlow = BROKEN_FLOW_ERROR_RETURN_LABEL;
    }
    render(code, options) {
        this.argument.render(code, options, { preventASI: true });
        if (this.argument.start === this.start + 5 /* 'throw'.length */) {
            code.prependLeft(this.start + 5, ' ');
        }
    }
}

class TryStatement extends NodeBase {
    constructor() {
        super(...arguments);
        this.directlyIncluded = false;
    }
    hasEffects(context) {
        return ((this.context.tryCatchDeoptimization
            ? this.block.body.length > 0
            : this.block.hasEffects(context)) ||
            (this.finalizer !== null && this.finalizer.hasEffects(context)));
    }
    include(context, includeChildrenRecursively) {
        const { brokenFlow } = context;
        if (!this.directlyIncluded || !this.context.tryCatchDeoptimization) {
            this.included = true;
            this.directlyIncluded = true;
            this.block.include(context, this.context.tryCatchDeoptimization ? INCLUDE_PARAMETERS : includeChildrenRecursively);
            context.brokenFlow = brokenFlow;
        }
        if (this.handler !== null) {
            this.handler.include(context, includeChildrenRecursively);
            context.brokenFlow = brokenFlow;
        }
        if (this.finalizer !== null) {
            this.finalizer.include(context, includeChildrenRecursively);
        }
    }
}

const unaryOperators = {
    '!': value => !value,
    '+': value => +value,
    '-': value => -value,
    delete: () => UnknownValue,
    typeof: value => typeof value,
    void: () => undefined,
    '~': value => ~value
};
class UnaryExpression extends NodeBase {
    bind() {
        super.bind();
        if (this.operator === 'delete') {
            this.argument.deoptimizePath(EMPTY_PATH);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (path.length > 0)
            return UnknownValue;
        const argumentValue = this.argument.getLiteralValueAtPath(EMPTY_PATH, recursionTracker, origin);
        if (argumentValue === UnknownValue)
            return UnknownValue;
        return unaryOperators[this.operator](argumentValue);
    }
    hasEffects(context) {
        if (this.operator === 'typeof' && this.argument instanceof Identifier$1)
            return false;
        return (this.argument.hasEffects(context) ||
            (this.operator === 'delete' &&
                this.argument.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context)));
    }
    hasEffectsWhenAccessedAtPath(path) {
        if (this.operator === 'void') {
            return path.length > 0;
        }
        return path.length > 1;
    }
}

class UnknownNode extends NodeBase {
    hasEffects() {
        return true;
    }
    include(context) {
        super.include(context, true);
    }
}

class UpdateExpression extends NodeBase {
    bind() {
        super.bind();
        this.argument.deoptimizePath(EMPTY_PATH);
        if (this.argument instanceof Identifier$1) {
            const variable = this.scope.findVariable(this.argument.name);
            variable.isReassigned = true;
        }
    }
    hasEffects(context) {
        return (this.argument.hasEffects(context) ||
            this.argument.hasEffectsWhenAssignedAtPath(EMPTY_PATH, context));
    }
    hasEffectsWhenAccessedAtPath(path) {
        return path.length > 1;
    }
    render(code, options) {
        this.argument.render(code, options);
        const variable = this.argument.variable;
        if (options.format === 'system' && variable && variable.exportName) {
            const name = variable.getName();
            if (this.prefix) {
                code.overwrite(this.start, this.end, `exports('${variable.exportName}', ${this.operator}${name})`);
            }
            else {
                let op;
                switch (this.operator) {
                    case '++':
                        op = `${name} + 1`;
                        break;
                    case '--':
                        op = `${name} - 1`;
                        break;
                }
                code.overwrite(this.start, this.end, `(exports('${variable.exportName}', ${op}), ${name}${this.operator})`);
            }
        }
    }
}

function isReassignedExportsMember(variable) {
    return variable.renderBaseName !== null && variable.exportName !== null && variable.isReassigned;
}
function areAllDeclarationsIncludedAndNotExported(declarations) {
    for (const declarator of declarations) {
        if (!declarator.included)
            return false;
        if (declarator.id.type === Identifier) {
            if (declarator.id.variable.exportName)
                return false;
        }
        else {
            const exportedVariables = [];
            declarator.id.addExportedVariables(exportedVariables);
            if (exportedVariables.length > 0)
                return false;
        }
    }
    return true;
}
class VariableDeclaration extends NodeBase {
    deoptimizePath() {
        for (const declarator of this.declarations) {
            declarator.deoptimizePath(EMPTY_PATH);
        }
    }
    hasEffectsWhenAssignedAtPath() {
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        for (const declarator of this.declarations) {
            if (includeChildrenRecursively || declarator.shouldBeIncluded(context))
                declarator.include(context, includeChildrenRecursively);
        }
    }
    includeWithAllDeclaredVariables(includeChildrenRecursively, context) {
        this.included = true;
        for (const declarator of this.declarations) {
            declarator.include(context, includeChildrenRecursively);
        }
    }
    initialise() {
        for (const declarator of this.declarations) {
            declarator.declareDeclarator(this.kind);
        }
    }
    render(code, options, nodeRenderOptions = BLANK) {
        if (areAllDeclarationsIncludedAndNotExported(this.declarations)) {
            for (const declarator of this.declarations) {
                declarator.render(code, options);
            }
            if (!nodeRenderOptions.isNoStatement &&
                code.original.charCodeAt(this.end - 1) !== 59 /*";"*/) {
                code.appendLeft(this.end, ';');
            }
        }
        else {
            this.renderReplacedDeclarations(code, options, nodeRenderOptions);
        }
    }
    renderDeclarationEnd(code, separatorString, lastSeparatorPos, actualContentEnd, renderedContentEnd, addSemicolon, systemPatternExports) {
        if (code.original.charCodeAt(this.end - 1) === 59 /*";"*/) {
            code.remove(this.end - 1, this.end);
        }
        if (addSemicolon) {
            separatorString += ';';
        }
        if (lastSeparatorPos !== null) {
            if (code.original.charCodeAt(actualContentEnd - 1) === 10 /*"\n"*/ &&
                (code.original.charCodeAt(this.end) === 10 /*"\n"*/ ||
                    code.original.charCodeAt(this.end) === 13) /*"\r"*/) {
                actualContentEnd--;
                if (code.original.charCodeAt(actualContentEnd) === 13 /*"\r"*/) {
                    actualContentEnd--;
                }
            }
            if (actualContentEnd === lastSeparatorPos + 1) {
                code.overwrite(lastSeparatorPos, renderedContentEnd, separatorString);
            }
            else {
                code.overwrite(lastSeparatorPos, lastSeparatorPos + 1, separatorString);
                code.remove(actualContentEnd, renderedContentEnd);
            }
        }
        else {
            code.appendLeft(renderedContentEnd, separatorString);
        }
        if (systemPatternExports.length > 0) {
            code.appendLeft(renderedContentEnd, ' ' + getSystemExportStatement(systemPatternExports));
        }
    }
    renderReplacedDeclarations(code, options, { start = this.start, end = this.end, isNoStatement }) {
        const separatedNodes = getCommaSeparatedNodesWithBoundaries(this.declarations, code, this.start + this.kind.length, this.end - (code.original.charCodeAt(this.end - 1) === 59 /*";"*/ ? 1 : 0));
        let actualContentEnd, renderedContentEnd;
        if (/\n\s*$/.test(code.slice(this.start, separatedNodes[0].start))) {
            renderedContentEnd = this.start + this.kind.length;
        }
        else {
            renderedContentEnd = separatedNodes[0].start;
        }
        let lastSeparatorPos = renderedContentEnd - 1;
        code.remove(this.start, lastSeparatorPos);
        let isInDeclaration = false;
        let hasRenderedContent = false;
        let separatorString = '', leadingString, nextSeparatorString;
        const systemPatternExports = [];
        for (const { node, start, separator, contentEnd, end } of separatedNodes) {
            if (!node.included ||
                (node.id instanceof Identifier$1 &&
                    isReassignedExportsMember(node.id.variable) &&
                    node.init === null)) {
                code.remove(start, end);
                continue;
            }
            leadingString = '';
            nextSeparatorString = '';
            if (node.id instanceof Identifier$1 &&
                isReassignedExportsMember(node.id.variable)) {
                if (hasRenderedContent) {
                    separatorString += ';';
                }
                isInDeclaration = false;
            }
            else {
                if (options.format === 'system' && node.init !== null) {
                    if (node.id.type !== Identifier) {
                        node.id.addExportedVariables(systemPatternExports);
                    }
                    else if (node.id.variable.exportName) {
                        code.prependLeft(code.original.indexOf('=', node.id.end) + 1, ` exports('${node.id.variable.safeExportName || node.id.variable.exportName}',`);
                        nextSeparatorString += ')';
                    }
                }
                if (isInDeclaration) {
                    separatorString += ',';
                }
                else {
                    if (hasRenderedContent) {
                        separatorString += ';';
                    }
                    leadingString += `${this.kind} `;
                    isInDeclaration = true;
                }
            }
            if (renderedContentEnd === lastSeparatorPos + 1) {
                code.overwrite(lastSeparatorPos, renderedContentEnd, separatorString + leadingString);
            }
            else {
                code.overwrite(lastSeparatorPos, lastSeparatorPos + 1, separatorString);
                code.appendLeft(renderedContentEnd, leadingString);
            }
            node.render(code, options);
            actualContentEnd = contentEnd;
            renderedContentEnd = end;
            hasRenderedContent = true;
            lastSeparatorPos = separator;
            separatorString = nextSeparatorString;
        }
        if (hasRenderedContent) {
            this.renderDeclarationEnd(code, separatorString, lastSeparatorPos, actualContentEnd, renderedContentEnd, !isNoStatement, systemPatternExports);
        }
        else {
            code.remove(start, end);
        }
    }
}

class VariableDeclarator extends NodeBase {
    declareDeclarator(kind) {
        this.id.declare(kind, this.init || UNDEFINED_EXPRESSION);
    }
    deoptimizePath(path) {
        this.id.deoptimizePath(path);
    }
    render(code, options) {
        // This can happen for hoisted variables in dead branches
        if (this.init !== null && !this.init.included) {
            code.remove(this.id.end, this.end);
            this.id.render(code, options);
        }
        else {
            super.render(code, options);
        }
    }
}

class WhileStatement extends NodeBase {
    hasEffects(context) {
        if (this.test.hasEffects(context))
            return true;
        const { brokenFlow, ignore: { breaks, continues } } = context;
        context.ignore.breaks = true;
        context.ignore.continues = true;
        if (this.body.hasEffects(context))
            return true;
        context.ignore.breaks = breaks;
        context.ignore.continues = continues;
        context.brokenFlow = brokenFlow;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.test.include(context, includeChildrenRecursively);
        const { brokenFlow } = context;
        this.body.include(context, includeChildrenRecursively);
        context.brokenFlow = brokenFlow;
    }
}

class YieldExpression extends NodeBase {
    bind() {
        super.bind();
        if (this.argument !== null) {
            this.argument.deoptimizePath(UNKNOWN_PATH);
        }
    }
    hasEffects(context) {
        return (!context.ignore.returnAwaitYield ||
            (this.argument !== null && this.argument.hasEffects(context)));
    }
    render(code, options) {
        if (this.argument) {
            this.argument.render(code, options);
            if (this.argument.start === this.start + 5 /* 'yield'.length */) {
                code.prependLeft(this.start + 5, ' ');
            }
        }
    }
}

const nodeConstructors = {
    ArrayExpression,
    ArrayPattern,
    ArrowFunctionExpression: ArrowFunctionExpression$1,
    AssignmentExpression,
    AssignmentPattern,
    AwaitExpression,
    BinaryExpression,
    BlockStatement: BlockStatement$1,
    BreakStatement,
    CallExpression: CallExpression$1,
    CatchClause,
    ClassBody,
    ClassDeclaration,
    ClassExpression,
    ConditionalExpression,
    ContinueStatement,
    DoWhileStatement,
    EmptyStatement,
    ExportAllDeclaration,
    ExportDefaultDeclaration,
    ExportNamedDeclaration,
    ExportSpecifier,
    ExpressionStatement: ExpressionStatement$1,
    FieldDefinition,
    ForInStatement,
    ForOfStatement,
    ForStatement,
    FunctionDeclaration,
    FunctionExpression: FunctionExpression$1,
    Identifier: Identifier$1,
    IfStatement,
    ImportDeclaration,
    ImportDefaultSpecifier: ImportDefaultSpecifier$1,
    ImportExpression: Import,
    ImportNamespaceSpecifier: ImportNamespaceSpecifier$1,
    ImportSpecifier,
    LabeledStatement,
    Literal,
    LogicalExpression,
    MemberExpression,
    MetaProperty,
    MethodDefinition,
    NewExpression,
    ObjectExpression,
    ObjectPattern,
    PrivateName,
    Program: Program$1,
    Property: Property$1,
    RestElement,
    ReturnStatement: ReturnStatement$1,
    SequenceExpression,
    SpreadElement,
    Super,
    SwitchCase,
    SwitchStatement,
    TaggedTemplateExpression,
    TemplateElement,
    TemplateLiteral,
    ThisExpression,
    ThrowStatement,
    TryStatement,
    UnaryExpression,
    UnknownNode,
    UpdateExpression,
    VariableDeclaration,
    VariableDeclarator,
    WhileStatement,
    YieldExpression
};

function getOriginalLocation(sourcemapChain, location) {
    // This cast is guaranteed. If it were a missing Map, it wouldn't have a mappings.
    const filteredSourcemapChain = sourcemapChain.filter(sourcemap => sourcemap.mappings);
    while (filteredSourcemapChain.length > 0) {
        const sourcemap = filteredSourcemapChain.pop();
        const line = sourcemap.mappings[location.line - 1];
        let locationFound = false;
        if (line !== undefined) {
            for (const segment of line) {
                if (segment[0] >= location.column) {
                    if (segment.length === 1)
                        break;
                    location = {
                        column: segment[3],
                        line: segment[2] + 1,
                        name: segment.length === 5 ? sourcemap.names[segment[4]] : undefined,
                        source: sourcemap.sources[segment[1]]
                    };
                    locationFound = true;
                    break;
                }
            }
        }
        if (!locationFound) {
            throw new Error("Can't resolve original location of error.");
        }
    }
    return location;
}

// AST walker module for Mozilla Parser API compatible trees

function skipThrough(node, st, c) { c(node, st); }
function ignore(_node, _st, _c) {}

// Node walkers.

var base$1 = {};

base$1.Program = base$1.BlockStatement = function (node, st, c) {
  for (var i = 0, list = node.body; i < list.length; i += 1)
    {
    var stmt = list[i];

    c(stmt, st, "Statement");
  }
};
base$1.Statement = skipThrough;
base$1.EmptyStatement = ignore;
base$1.ExpressionStatement = base$1.ParenthesizedExpression =
  function (node, st, c) { return c(node.expression, st, "Expression"); };
base$1.IfStatement = function (node, st, c) {
  c(node.test, st, "Expression");
  c(node.consequent, st, "Statement");
  if (node.alternate) { c(node.alternate, st, "Statement"); }
};
base$1.LabeledStatement = function (node, st, c) { return c(node.body, st, "Statement"); };
base$1.BreakStatement = base$1.ContinueStatement = ignore;
base$1.WithStatement = function (node, st, c) {
  c(node.object, st, "Expression");
  c(node.body, st, "Statement");
};
base$1.SwitchStatement = function (node, st, c) {
  c(node.discriminant, st, "Expression");
  for (var i$1 = 0, list$1 = node.cases; i$1 < list$1.length; i$1 += 1) {
    var cs = list$1[i$1];

    if (cs.test) { c(cs.test, st, "Expression"); }
    for (var i = 0, list = cs.consequent; i < list.length; i += 1)
      {
      var cons = list[i];

      c(cons, st, "Statement");
    }
  }
};
base$1.SwitchCase = function (node, st, c) {
  if (node.test) { c(node.test, st, "Expression"); }
  for (var i = 0, list = node.consequent; i < list.length; i += 1)
    {
    var cons = list[i];

    c(cons, st, "Statement");
  }
};
base$1.ReturnStatement = base$1.YieldExpression = base$1.AwaitExpression = function (node, st, c) {
  if (node.argument) { c(node.argument, st, "Expression"); }
};
base$1.ThrowStatement = base$1.SpreadElement =
  function (node, st, c) { return c(node.argument, st, "Expression"); };
base$1.TryStatement = function (node, st, c) {
  c(node.block, st, "Statement");
  if (node.handler) { c(node.handler, st); }
  if (node.finalizer) { c(node.finalizer, st, "Statement"); }
};
base$1.CatchClause = function (node, st, c) {
  if (node.param) { c(node.param, st, "Pattern"); }
  c(node.body, st, "Statement");
};
base$1.WhileStatement = base$1.DoWhileStatement = function (node, st, c) {
  c(node.test, st, "Expression");
  c(node.body, st, "Statement");
};
base$1.ForStatement = function (node, st, c) {
  if (node.init) { c(node.init, st, "ForInit"); }
  if (node.test) { c(node.test, st, "Expression"); }
  if (node.update) { c(node.update, st, "Expression"); }
  c(node.body, st, "Statement");
};
base$1.ForInStatement = base$1.ForOfStatement = function (node, st, c) {
  c(node.left, st, "ForInit");
  c(node.right, st, "Expression");
  c(node.body, st, "Statement");
};
base$1.ForInit = function (node, st, c) {
  if (node.type === "VariableDeclaration") { c(node, st); }
  else { c(node, st, "Expression"); }
};
base$1.DebuggerStatement = ignore;

base$1.FunctionDeclaration = function (node, st, c) { return c(node, st, "Function"); };
base$1.VariableDeclaration = function (node, st, c) {
  for (var i = 0, list = node.declarations; i < list.length; i += 1)
    {
    var decl = list[i];

    c(decl, st);
  }
};
base$1.VariableDeclarator = function (node, st, c) {
  c(node.id, st, "Pattern");
  if (node.init) { c(node.init, st, "Expression"); }
};

base$1.Function = function (node, st, c) {
  if (node.id) { c(node.id, st, "Pattern"); }
  for (var i = 0, list = node.params; i < list.length; i += 1)
    {
    var param = list[i];

    c(param, st, "Pattern");
  }
  c(node.body, st, node.expression ? "Expression" : "Statement");
};

base$1.Pattern = function (node, st, c) {
  if (node.type === "Identifier")
    { c(node, st, "VariablePattern"); }
  else if (node.type === "MemberExpression")
    { c(node, st, "MemberPattern"); }
  else
    { c(node, st); }
};
base$1.VariablePattern = ignore;
base$1.MemberPattern = skipThrough;
base$1.RestElement = function (node, st, c) { return c(node.argument, st, "Pattern"); };
base$1.ArrayPattern = function (node, st, c) {
  for (var i = 0, list = node.elements; i < list.length; i += 1) {
    var elt = list[i];

    if (elt) { c(elt, st, "Pattern"); }
  }
};
base$1.ObjectPattern = function (node, st, c) {
  for (var i = 0, list = node.properties; i < list.length; i += 1) {
    var prop = list[i];

    if (prop.type === "Property") {
      if (prop.computed) { c(prop.key, st, "Expression"); }
      c(prop.value, st, "Pattern");
    } else if (prop.type === "RestElement") {
      c(prop.argument, st, "Pattern");
    }
  }
};

base$1.Expression = skipThrough;
base$1.ThisExpression = base$1.Super = base$1.MetaProperty = ignore;
base$1.ArrayExpression = function (node, st, c) {
  for (var i = 0, list = node.elements; i < list.length; i += 1) {
    var elt = list[i];

    if (elt) { c(elt, st, "Expression"); }
  }
};
base$1.ObjectExpression = function (node, st, c) {
  for (var i = 0, list = node.properties; i < list.length; i += 1)
    {
    var prop = list[i];

    c(prop, st);
  }
};
base$1.FunctionExpression = base$1.ArrowFunctionExpression = base$1.FunctionDeclaration;
base$1.SequenceExpression = function (node, st, c) {
  for (var i = 0, list = node.expressions; i < list.length; i += 1)
    {
    var expr = list[i];

    c(expr, st, "Expression");
  }
};
base$1.TemplateLiteral = function (node, st, c) {
  for (var i = 0, list = node.quasis; i < list.length; i += 1)
    {
    var quasi = list[i];

    c(quasi, st);
  }

  for (var i$1 = 0, list$1 = node.expressions; i$1 < list$1.length; i$1 += 1)
    {
    var expr = list$1[i$1];

    c(expr, st, "Expression");
  }
};
base$1.TemplateElement = ignore;
base$1.UnaryExpression = base$1.UpdateExpression = function (node, st, c) {
  c(node.argument, st, "Expression");
};
base$1.BinaryExpression = base$1.LogicalExpression = function (node, st, c) {
  c(node.left, st, "Expression");
  c(node.right, st, "Expression");
};
base$1.AssignmentExpression = base$1.AssignmentPattern = function (node, st, c) {
  c(node.left, st, "Pattern");
  c(node.right, st, "Expression");
};
base$1.ConditionalExpression = function (node, st, c) {
  c(node.test, st, "Expression");
  c(node.consequent, st, "Expression");
  c(node.alternate, st, "Expression");
};
base$1.NewExpression = base$1.CallExpression = function (node, st, c) {
  c(node.callee, st, "Expression");
  if (node.arguments)
    { for (var i = 0, list = node.arguments; i < list.length; i += 1)
      {
        var arg = list[i];

        c(arg, st, "Expression");
      } }
};
base$1.MemberExpression = function (node, st, c) {
  c(node.object, st, "Expression");
  if (node.computed) { c(node.property, st, "Expression"); }
};
base$1.ExportNamedDeclaration = base$1.ExportDefaultDeclaration = function (node, st, c) {
  if (node.declaration)
    { c(node.declaration, st, node.type === "ExportNamedDeclaration" || node.declaration.id ? "Statement" : "Expression"); }
  if (node.source) { c(node.source, st, "Expression"); }
};
base$1.ExportAllDeclaration = function (node, st, c) {
  c(node.source, st, "Expression");
};
base$1.ImportDeclaration = function (node, st, c) {
  for (var i = 0, list = node.specifiers; i < list.length; i += 1)
    {
    var spec = list[i];

    c(spec, st);
  }
  c(node.source, st, "Expression");
};
base$1.ImportExpression = function (node, st, c) {
  c(node.source, st, "Expression");
};
base$1.ImportSpecifier = base$1.ImportDefaultSpecifier = base$1.ImportNamespaceSpecifier = base$1.Identifier = base$1.Literal = ignore;

base$1.TaggedTemplateExpression = function (node, st, c) {
  c(node.tag, st, "Expression");
  c(node.quasi, st, "Expression");
};
base$1.ClassDeclaration = base$1.ClassExpression = function (node, st, c) { return c(node, st, "Class"); };
base$1.Class = function (node, st, c) {
  if (node.id) { c(node.id, st, "Pattern"); }
  if (node.superClass) { c(node.superClass, st, "Expression"); }
  c(node.body, st);
};
base$1.ClassBody = function (node, st, c) {
  for (var i = 0, list = node.body; i < list.length; i += 1)
    {
    var elt = list[i];

    c(elt, st);
  }
};
base$1.MethodDefinition = base$1.Property = function (node, st, c) {
  if (node.computed) { c(node.key, st, "Expression"); }
  c(node.value, st, "Expression");
};

// @ts-ignore
function handlePureAnnotationsOfNode(node, state, type = node.type) {
    let commentNode = state.commentNodes[state.commentIndex];
    while (commentNode && node.start >= commentNode.end) {
        markPureNode(node, commentNode);
        commentNode = state.commentNodes[++state.commentIndex];
    }
    if (commentNode && commentNode.end <= node.end) {
        base$1[type](node, state, handlePureAnnotationsOfNode);
    }
}
function markPureNode(node, comment) {
    if (node.annotations) {
        node.annotations.push(comment);
    }
    else {
        node.annotations = [comment];
    }
    if (node.type === 'ExpressionStatement') {
        node = node.expression;
    }
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
        node.annotatedPure = true;
    }
}
const pureCommentRegex = /[@#]__PURE__/;
const isPureComment = (comment) => pureCommentRegex.test(comment.text);
function markPureCallExpressions(comments, esTreeAst) {
    handlePureAnnotationsOfNode(esTreeAst, {
        commentIndex: 0,
        commentNodes: comments.filter(isPureComment)
    });
}

// this looks ridiculous, but it prevents sourcemap tooling from mistaking
// this for an actual sourceMappingURL
let SOURCEMAPPING_URL = 'sourceMa';
SOURCEMAPPING_URL += 'ppingURL';
const SOURCEMAPPING_URL_RE = new RegExp(`^#\\s+${SOURCEMAPPING_URL}=.+\\n?`);

const NOOP = () => { };
let getStartTime = () => [0, 0];
let getElapsedTime = () => 0;
let getMemory = () => 0;
let timers = {};
const normalizeHrTime = (time) => time[0] * 1e3 + time[1] / 1e6;
function setTimeHelpers() {
    if (typeof process !== 'undefined' && typeof process.hrtime === 'function') {
        getStartTime = process.hrtime.bind(process);
        getElapsedTime = previous => normalizeHrTime(process.hrtime(previous));
    }
    else if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        getStartTime = () => [performance.now(), 0];
        getElapsedTime = previous => performance.now() - previous[0];
    }
    if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
        getMemory = () => process.memoryUsage().heapUsed;
    }
}
function getPersistedLabel(label, level) {
    switch (level) {
        case 1:
            return `# ${label}`;
        case 2:
            return `## ${label}`;
        case 3:
            return label;
        default:
            return `${'  '.repeat(level - 4)}- ${label}`;
    }
}
function timeStartImpl(label, level = 3) {
    label = getPersistedLabel(label, level);
    if (!timers.hasOwnProperty(label)) {
        timers[label] = {
            memory: 0,
            startMemory: undefined,
            startTime: undefined,
            time: 0,
            totalMemory: 0
        };
    }
    const currentMemory = getMemory();
    timers[label].startTime = getStartTime();
    timers[label].startMemory = currentMemory;
}
function timeEndImpl(label, level = 3) {
    label = getPersistedLabel(label, level);
    if (timers.hasOwnProperty(label)) {
        const currentMemory = getMemory();
        timers[label].time += getElapsedTime(timers[label].startTime);
        timers[label].totalMemory = Math.max(timers[label].totalMemory, currentMemory);
        timers[label].memory += currentMemory - timers[label].startMemory;
    }
}
function getTimings() {
    const newTimings = {};
    for (const label of Object.keys(timers)) {
        newTimings[label] = [timers[label].time, timers[label].memory, timers[label].totalMemory];
    }
    return newTimings;
}
let timeStart = NOOP, timeEnd = NOOP;
const TIMED_PLUGIN_HOOKS = {
    load: true,
    resolveDynamicImport: true,
    resolveId: true,
    transform: true
};
function getPluginWithTimers(plugin, index) {
    const timedPlugin = {};
    for (const hook of Object.keys(plugin)) {
        if (TIMED_PLUGIN_HOOKS[hook] === true) {
            let timerLabel = `plugin ${index}`;
            if (plugin.name) {
                timerLabel += ` (${plugin.name})`;
            }
            timerLabel += ` - ${hook}`;
            timedPlugin[hook] = function () {
                timeStart(timerLabel, 4);
                const result = plugin[hook].apply(this === timedPlugin ? plugin : this, arguments);
                timeEnd(timerLabel, 4);
                if (result && typeof result.then === 'function') {
                    timeStart(`${timerLabel} (async)`, 4);
                    result.then(() => timeEnd(`${timerLabel} (async)`, 4));
                }
                return result;
            };
        }
        else {
            timedPlugin[hook] = plugin[hook];
        }
    }
    return timedPlugin;
}
function initialiseTimers(inputOptions) {
    if (inputOptions.perf) {
        timers = {};
        setTimeHelpers();
        timeStart = timeStartImpl;
        timeEnd = timeEndImpl;
        inputOptions.plugins = inputOptions.plugins.map(getPluginWithTimers);
    }
    else {
        timeStart = NOOP;
        timeEnd = NOOP;
    }
}

const defaultAcornOptions = {
    ecmaVersion: 2020,
    preserveParens: false,
    sourceType: 'module'
};
function tryParse(module, Parser, acornOptions) {
    try {
        return Parser.parse(module.code, {
            ...defaultAcornOptions,
            ...acornOptions,
            onComment: (block, text, start, end) => module.comments.push({ block, text, start, end })
        });
    }
    catch (err) {
        let message = err.message.replace(/ \(\d+:\d+\)$/, '');
        if (module.id.endsWith('.json')) {
            message += ' (Note that you need @rollup/plugin-json to import JSON files)';
        }
        else if (!module.id.endsWith('.js')) {
            message += ' (Note that you need plugins to import files that are not JavaScript)';
        }
        return module.error({
            code: 'PARSE_ERROR',
            message,
            parserError: err
        }, err.pos);
    }
}
function handleMissingExport(exportName, importingModule, importedModule, importerStart) {
    return importingModule.error({
        code: 'MISSING_EXPORT',
        message: `'${exportName}' is not exported by ${relativeId(importedModule)}, imported by ${relativeId(importingModule.id)}`,
        url: `https://rollupjs.org/guide/en/#error-name-is-not-exported-by-module`
    }, importerStart);
}
const MISSING_EXPORT_SHIM_DESCRIPTION = {
    identifier: null,
    localName: MISSING_EXPORT_SHIM_VARIABLE
};
function getVariableForExportNameRecursive(target, name, isExportAllSearch, searchedNamesAndModules = new Map()) {
    const searchedModules = searchedNamesAndModules.get(name);
    if (searchedModules) {
        if (searchedModules.has(target)) {
            return null;
        }
        searchedModules.add(target);
    }
    else {
        searchedNamesAndModules.set(name, new Set([target]));
    }
    return target.getVariableForExportName(name, isExportAllSearch, searchedNamesAndModules);
}
class Module {
    constructor(graph, id, moduleSideEffects, syntheticNamedExports, isEntryPoint) {
        var _a;
        this.graph = graph;
        this.id = id;
        this.moduleSideEffects = moduleSideEffects;
        this.syntheticNamedExports = syntheticNamedExports;
        this.isEntryPoint = isEntryPoint;
        this.chunk = null;
        this.chunkFileNames = new Set();
        this.chunkName = null;
        this.comments = [];
        this.dependencies = new Set();
        this.dynamicDependencies = new Set();
        this.dynamicImporters = [];
        this.dynamicImports = [];
        this.execIndex = Infinity;
        this.exportAllSources = new Set();
        this.exports = Object.create(null);
        this.exportsAll = Object.create(null);
        this.facadeChunk = null;
        this.importDescriptions = Object.create(null);
        this.importers = [];
        this.importMetas = [];
        this.imports = new Set();
        this.includedDynamicImporters = [];
        this.isExecuted = false;
        this.isUserDefinedEntryPoint = false;
        this.manualChunkAlias = null;
        this.preserveSignature = (_a = this.graph.preserveEntrySignatures) !== null && _a !== void 0 ? _a : 'strict';
        this.reexportDescriptions = Object.create(null);
        this.sources = new Set();
        this.userChunkNames = new Set();
        this.usesTopLevelAwait = false;
        this.allExportNames = null;
        this.defaultExport = null;
        this.exportAllModules = [];
        this.exportNamesByVariable = null;
        this.exportShimVariable = new ExportShimVariable(this);
        this.relevantDependencies = null;
        this.syntheticExports = new Map();
        this.transformDependencies = [];
        this.transitiveReexports = null;
        this.excludeFromSourcemap = /\0/.test(id);
        this.context = graph.getModuleContext(id);
    }
    basename() {
        const base = path.basename(this.id);
        const ext = path.extname(this.id);
        return makeLegal(ext ? base.slice(0, -ext.length) : base);
    }
    bindReferences() {
        this.ast.bind();
    }
    error(props, pos) {
        if (typeof pos === 'number') {
            props.pos = pos;
            let location = locate(this.code, pos, { offsetLine: 1 });
            try {
                location = getOriginalLocation(this.sourcemapChain, location);
            }
            catch (e) {
                this.warn({
                    code: 'SOURCEMAP_ERROR',
                    loc: {
                        column: location.column,
                        file: this.id,
                        line: location.line
                    },
                    message: `Error when using sourcemap for reporting an error: ${e.message}`,
                    pos
                });
            }
            props.loc = {
                column: location.column,
                file: this.id,
                line: location.line
            };
            props.frame = getCodeFrame(this.originalCode, location.line, location.column);
        }
        return error(props);
    }
    getAllExportNames() {
        if (this.allExportNames) {
            return this.allExportNames;
        }
        const allExportNames = (this.allExportNames = new Set());
        for (const name of Object.keys(this.exports)) {
            allExportNames.add(name);
        }
        for (const name of Object.keys(this.reexportDescriptions)) {
            allExportNames.add(name);
        }
        for (const module of this.exportAllModules) {
            if (module instanceof ExternalModule) {
                allExportNames.add(`*${module.id}`);
                continue;
            }
            for (const name of module.getAllExportNames()) {
                if (name !== 'default')
                    allExportNames.add(name);
            }
        }
        return allExportNames;
    }
    getDefaultExport() {
        if (this.defaultExport === null) {
            this.defaultExport = undefined;
            this.defaultExport = this.getVariableForExportName('default');
        }
        if (!this.defaultExport) {
            return error({
                code: Errors.SYNTHETIC_NAMED_EXPORTS_NEED_DEFAULT,
                id: this.id,
                message: `Modules with 'syntheticNamedExports' need a default export.`
            });
        }
        return this.defaultExport;
    }
    getDependenciesToBeIncluded() {
        if (this.relevantDependencies)
            return this.relevantDependencies;
        const relevantDependencies = new Set();
        for (let variable of this.imports) {
            if (variable instanceof SyntheticNamedExportVariable) {
                variable = variable.getBaseVariable();
            }
            else if (variable instanceof ExportDefaultVariable) {
                variable = variable.getOriginalVariable();
            }
            relevantDependencies.add(variable.module);
        }
        if (this.isEntryPoint ||
            this.includedDynamicImporters.length > 0 ||
            this.graph.preserveModules) {
            for (const exportName of [...this.getReexports(), ...this.getExports()]) {
                let variable = this.getVariableForExportName(exportName);
                if (variable instanceof SyntheticNamedExportVariable) {
                    variable = variable.getBaseVariable();
                }
                else if (variable instanceof ExportDefaultVariable) {
                    variable = variable.getOriginalVariable();
                }
                relevantDependencies.add(variable.module);
            }
        }
        if (this.graph.treeshakingOptions) {
            const possibleDependencies = new Set(this.dependencies);
            for (const dependency of possibleDependencies) {
                if (!dependency.moduleSideEffects || relevantDependencies.has(dependency))
                    continue;
                if (dependency instanceof ExternalModule || dependency.hasEffects()) {
                    relevantDependencies.add(dependency);
                }
                else {
                    for (const transitiveDependency of dependency.dependencies) {
                        possibleDependencies.add(transitiveDependency);
                    }
                }
            }
        }
        else {
            for (const dependency of this.dependencies) {
                relevantDependencies.add(dependency);
            }
        }
        return (this.relevantDependencies = relevantDependencies);
    }
    getExportNamesByVariable() {
        if (this.exportNamesByVariable) {
            return this.exportNamesByVariable;
        }
        const exportNamesByVariable = new Map();
        for (const exportName of this.getAllExportNames()) {
            let tracedVariable = this.getVariableForExportName(exportName);
            if (tracedVariable instanceof ExportDefaultVariable) {
                tracedVariable = tracedVariable.getOriginalVariable();
            }
            if (!tracedVariable ||
                !(tracedVariable.included || tracedVariable instanceof ExternalVariable)) {
                continue;
            }
            const existingExportNames = exportNamesByVariable.get(tracedVariable);
            if (existingExportNames) {
                existingExportNames.push(exportName);
            }
            else {
                exportNamesByVariable.set(tracedVariable, [exportName]);
            }
        }
        return (this.exportNamesByVariable = exportNamesByVariable);
    }
    getExports() {
        return Object.keys(this.exports);
    }
    getReexports() {
        if (this.transitiveReexports) {
            return this.transitiveReexports;
        }
        // to avoid infinite recursion when using circular `export * from X`
        this.transitiveReexports = [];
        const reexports = new Set();
        for (const name in this.reexportDescriptions) {
            reexports.add(name);
        }
        for (const module of this.exportAllModules) {
            if (module instanceof ExternalModule) {
                reexports.add(`*${module.id}`);
            }
            else {
                for (const name of [...module.getReexports(), ...module.getExports()]) {
                    if (name !== 'default')
                        reexports.add(name);
                }
            }
        }
        return (this.transitiveReexports = [...reexports]);
    }
    getRenderedExports() {
        // only direct exports are counted here, not reexports at all
        const renderedExports = [];
        const removedExports = [];
        for (const exportName in this.exports) {
            const variable = this.getVariableForExportName(exportName);
            (variable && variable.included ? renderedExports : removedExports).push(exportName);
        }
        return { renderedExports, removedExports };
    }
    getVariableForExportName(name, isExportAllSearch, searchedNamesAndModules) {
        if (name[0] === '*') {
            if (name.length === 1) {
                return this.namespace;
            }
            else {
                // export * from 'external'
                const module = this.graph.moduleById.get(name.slice(1));
                return module.getVariableForExportName('*');
            }
        }
        // export { foo } from './other'
        const reexportDeclaration = this.reexportDescriptions[name];
        if (reexportDeclaration) {
            const declaration = getVariableForExportNameRecursive(reexportDeclaration.module, reexportDeclaration.localName, false, searchedNamesAndModules);
            if (!declaration) {
                return handleMissingExport(reexportDeclaration.localName, this, reexportDeclaration.module.id, reexportDeclaration.start);
            }
            return declaration;
        }
        const exportDeclaration = this.exports[name];
        if (exportDeclaration) {
            if (exportDeclaration === MISSING_EXPORT_SHIM_DESCRIPTION) {
                return this.exportShimVariable;
            }
            const name = exportDeclaration.localName;
            return this.traceVariable(name) || this.graph.scope.findVariable(name);
        }
        if (name !== 'default') {
            for (const module of this.exportAllModules) {
                const declaration = getVariableForExportNameRecursive(module, name, true, searchedNamesAndModules);
                if (declaration)
                    return declaration;
            }
        }
        // we don't want to create shims when we are just
        // probing export * modules for exports
        if (!isExportAllSearch) {
            if (this.syntheticNamedExports) {
                let syntheticExport = this.syntheticExports.get(name);
                if (!syntheticExport) {
                    const defaultExport = this.getDefaultExport();
                    syntheticExport = new SyntheticNamedExportVariable(this.astContext, name, defaultExport);
                    this.syntheticExports.set(name, syntheticExport);
                    return syntheticExport;
                }
                return syntheticExport;
            }
            if (this.graph.shimMissingExports) {
                this.shimMissingExport(name);
                return this.exportShimVariable;
            }
        }
        return null;
    }
    hasEffects() {
        return (this.moduleSideEffects && this.ast.included && this.ast.hasEffects(createHasEffectsContext()));
    }
    include() {
        const context = createInclusionContext();
        if (this.ast.shouldBeIncluded(context))
            this.ast.include(context, false);
    }
    includeAllExports() {
        if (!this.isExecuted) {
            this.graph.needsTreeshakingPass = true;
            markModuleAndImpureDependenciesAsExecuted(this);
        }
        for (const exportName of this.getExports()) {
            const variable = this.getVariableForExportName(exportName);
            variable.deoptimizePath(UNKNOWN_PATH);
            if (!variable.included) {
                variable.include();
                this.graph.needsTreeshakingPass = true;
            }
        }
        for (const name of this.getReexports()) {
            const variable = this.getVariableForExportName(name);
            variable.deoptimizePath(UNKNOWN_PATH);
            if (!variable.included) {
                variable.include();
                this.graph.needsTreeshakingPass = true;
            }
            if (variable instanceof ExternalVariable) {
                variable.module.reexported = true;
            }
        }
    }
    includeAllInBundle() {
        this.ast.include(createInclusionContext(), true);
    }
    isIncluded() {
        return this.ast.included || this.namespace.included;
    }
    linkDependencies() {
        for (const source of this.sources) {
            this.dependencies.add(this.graph.moduleById.get(this.resolvedIds[source].id));
        }
        for (const { resolution } of this.dynamicImports) {
            if (resolution instanceof Module || resolution instanceof ExternalModule) {
                this.dynamicDependencies.add(resolution);
            }
        }
        this.addModulesToImportDescriptions(this.importDescriptions);
        this.addModulesToImportDescriptions(this.reexportDescriptions);
        const externalExportAllModules = [];
        for (const source of this.exportAllSources) {
            const module = this.graph.moduleById.get(this.resolvedIds[source].id);
            (module instanceof ExternalModule ? externalExportAllModules : this.exportAllModules).push(module);
        }
        this.exportAllModules = [...this.exportAllModules, ...externalExportAllModules];
    }
    render(options) {
        const magicString = this.magicString.clone();
        this.ast.render(magicString, options);
        this.usesTopLevelAwait = this.astContext.usesTopLevelAwait;
        return magicString;
    }
    setSource({ alwaysRemovedCode, ast, code, customTransformCache, moduleSideEffects, originalCode, originalSourcemap, resolvedIds, sourcemapChain, syntheticNamedExports, transformDependencies, transformFiles }) {
        this.code = code;
        this.originalCode = originalCode;
        this.originalSourcemap = originalSourcemap;
        this.sourcemapChain = sourcemapChain;
        if (transformFiles) {
            this.transformFiles = transformFiles;
        }
        this.transformDependencies = transformDependencies;
        this.customTransformCache = customTransformCache;
        if (typeof moduleSideEffects === 'boolean') {
            this.moduleSideEffects = moduleSideEffects;
        }
        if (typeof syntheticNamedExports === 'boolean') {
            this.syntheticNamedExports = syntheticNamedExports;
        }
        timeStart('generate ast', 3);
        this.alwaysRemovedCode = alwaysRemovedCode || [];
        if (ast) {
            this.esTreeAst = ast;
        }
        else {
            this.esTreeAst = tryParse(this, this.graph.acornParser, this.graph.acornOptions);
            for (const comment of this.comments) {
                if (!comment.block && SOURCEMAPPING_URL_RE.test(comment.text)) {
                    this.alwaysRemovedCode.push([comment.start, comment.end]);
                }
            }
            markPureCallExpressions(this.comments, this.esTreeAst);
        }
        timeEnd('generate ast', 3);
        this.resolvedIds = resolvedIds || Object.create(null);
        // By default, `id` is the file name. Custom resolvers and loaders
        // can change that, but it makes sense to use it for the source file name
        const fileName = this.id;
        this.magicString = new MagicString(code, {
            filename: (this.excludeFromSourcemap ? null : fileName),
            indentExclusionRanges: []
        });
        for (const [start, end] of this.alwaysRemovedCode) {
            this.magicString.remove(start, end);
        }
        timeStart('analyse ast', 3);
        this.astContext = {
            addDynamicImport: this.addDynamicImport.bind(this),
            addExport: this.addExport.bind(this),
            addImport: this.addImport.bind(this),
            addImportMeta: this.addImportMeta.bind(this),
            annotations: (this.graph.treeshakingOptions && this.graph.treeshakingOptions.annotations),
            code,
            deoptimizationTracker: this.graph.deoptimizationTracker,
            error: this.error.bind(this),
            fileName,
            getExports: this.getExports.bind(this),
            getModuleExecIndex: () => this.execIndex,
            getModuleName: this.basename.bind(this),
            getReexports: this.getReexports.bind(this),
            importDescriptions: this.importDescriptions,
            includeAndGetAdditionalMergedNamespaces: this.includeAndGetAdditionalMergedNamespaces.bind(this),
            includeDynamicImport: this.includeDynamicImport.bind(this),
            includeVariable: this.includeVariable.bind(this),
            magicString: this.magicString,
            module: this,
            moduleContext: this.context,
            nodeConstructors,
            preserveModules: this.graph.preserveModules,
            propertyReadSideEffects: (!this.graph.treeshakingOptions ||
                this.graph.treeshakingOptions.propertyReadSideEffects),
            traceExport: this.getVariableForExportName.bind(this),
            traceVariable: this.traceVariable.bind(this),
            treeshake: !!this.graph.treeshakingOptions,
            tryCatchDeoptimization: (!this.graph.treeshakingOptions ||
                this.graph.treeshakingOptions.tryCatchDeoptimization),
            unknownGlobalSideEffects: (!this.graph.treeshakingOptions ||
                this.graph.treeshakingOptions.unknownGlobalSideEffects),
            usesTopLevelAwait: false,
            warn: this.warn.bind(this),
            warnDeprecation: this.graph.warnDeprecation.bind(this.graph)
        };
        this.scope = new ModuleScope(this.graph.scope, this.astContext);
        this.namespace = new NamespaceVariable(this.astContext, this.syntheticNamedExports);
        this.ast = new Program$1(this.esTreeAst, { type: 'Module', context: this.astContext }, this.scope);
        timeEnd('analyse ast', 3);
    }
    toJSON() {
        return {
            alwaysRemovedCode: this.alwaysRemovedCode,
            ast: this.esTreeAst,
            code: this.code,
            customTransformCache: this.customTransformCache,
            dependencies: [...this.dependencies].map(module => module.id),
            id: this.id,
            moduleSideEffects: this.moduleSideEffects,
            originalCode: this.originalCode,
            originalSourcemap: this.originalSourcemap,
            resolvedIds: this.resolvedIds,
            sourcemapChain: this.sourcemapChain,
            syntheticNamedExports: this.syntheticNamedExports,
            transformDependencies: this.transformDependencies,
            transformFiles: this.transformFiles
        };
    }
    traceVariable(name) {
        const localVariable = this.scope.variables.get(name);
        if (localVariable) {
            return localVariable;
        }
        if (name in this.importDescriptions) {
            const importDeclaration = this.importDescriptions[name];
            const otherModule = importDeclaration.module;
            if (otherModule instanceof Module && importDeclaration.name === '*') {
                return otherModule.namespace;
            }
            const declaration = otherModule.getVariableForExportName(importDeclaration.name);
            if (!declaration) {
                return handleMissingExport(importDeclaration.name, this, otherModule.id, importDeclaration.start);
            }
            return declaration;
        }
        return null;
    }
    warn(warning, pos) {
        if (typeof pos === 'number') {
            warning.pos = pos;
            const { line, column } = locate(this.code, pos, { offsetLine: 1 }); // TODO trace sourcemaps, cf. error()
            warning.loc = { file: this.id, line, column };
            warning.frame = getCodeFrame(this.code, line, column);
        }
        warning.id = this.id;
        this.graph.warn(warning);
    }
    addDynamicImport(node) {
        let argument = node.source;
        if (argument instanceof TemplateLiteral) {
            if (argument.quasis.length === 1 && argument.quasis[0].value.cooked) {
                argument = argument.quasis[0].value.cooked;
            }
        }
        else if (argument instanceof Literal && typeof argument.value === 'string') {
            argument = argument.value;
        }
        this.dynamicImports.push({ node, resolution: null, argument });
    }
    addExport(node) {
        if (node instanceof ExportDefaultDeclaration) {
            // export default foo;
            this.exports.default = {
                identifier: node.variable.getAssignedVariableName(),
                localName: 'default'
            };
        }
        else if (node instanceof ExportAllDeclaration) {
            const source = node.source.value;
            this.sources.add(source);
            if (node.exported) {
                // export * as name from './other'
                const name = node.exported.name;
                this.reexportDescriptions[name] = {
                    localName: '*',
                    module: null,
                    source,
                    start: node.start
                };
            }
            else {
                // export * from './other'
                this.exportAllSources.add(source);
            }
        }
        else if (node.source instanceof Literal) {
            // export { name } from './other'
            const source = node.source.value;
            this.sources.add(source);
            for (const specifier of node.specifiers) {
                const name = specifier.exported.name;
                this.reexportDescriptions[name] = {
                    localName: specifier.local.name,
                    module: null,
                    source,
                    start: specifier.start
                };
            }
        }
        else if (node.declaration) {
            const declaration = node.declaration;
            if (declaration instanceof VariableDeclaration) {
                // export var { foo, bar } = ...
                // export var foo = 1, bar = 2;
                for (const declarator of declaration.declarations) {
                    for (const localName of extractAssignedNames(declarator.id)) {
                        this.exports[localName] = { identifier: null, localName };
                    }
                }
            }
            else {
                // export function foo () {}
                const localName = declaration.id.name;
                this.exports[localName] = { identifier: null, localName };
            }
        }
        else {
            // export { foo, bar, baz }
            for (const specifier of node.specifiers) {
                const localName = specifier.local.name;
                const exportedName = specifier.exported.name;
                this.exports[exportedName] = { identifier: null, localName };
            }
        }
    }
    addImport(node) {
        const source = node.source.value;
        this.sources.add(source);
        for (const specifier of node.specifiers) {
            const isDefault = specifier.type === ImportDefaultSpecifier;
            const isNamespace = specifier.type === ImportNamespaceSpecifier;
            const name = isDefault
                ? 'default'
                : isNamespace
                    ? '*'
                    : specifier.imported.name;
            this.importDescriptions[specifier.local.name] = {
                module: null,
                name,
                source,
                start: specifier.start
            };
        }
    }
    addImportMeta(node) {
        this.importMetas.push(node);
    }
    addModulesToImportDescriptions(importDescription) {
        for (const name of Object.keys(importDescription)) {
            const specifier = importDescription[name];
            const id = this.resolvedIds[specifier.source].id;
            specifier.module = this.graph.moduleById.get(id);
        }
    }
    includeAndGetAdditionalMergedNamespaces() {
        const mergedNamespaces = [];
        for (const module of this.exportAllModules) {
            if (module instanceof ExternalModule) {
                const externalVariable = module.getVariableForExportName('*');
                externalVariable.include();
                this.imports.add(externalVariable);
                mergedNamespaces.push(externalVariable);
            }
            else if (module.syntheticNamedExports) {
                const syntheticNamespace = module.getDefaultExport();
                syntheticNamespace.include();
                this.imports.add(syntheticNamespace);
                mergedNamespaces.push(syntheticNamespace);
            }
        }
        return mergedNamespaces;
    }
    includeDynamicImport(node) {
        const resolution = this.dynamicImports.find(dynamicImport => dynamicImport.node === node).resolution;
        if (resolution instanceof Module) {
            resolution.includedDynamicImporters.push(this);
            resolution.includeAllExports();
        }
    }
    includeVariable(variable) {
        const variableModule = variable.module;
        if (!variable.included) {
            variable.include();
            this.graph.needsTreeshakingPass = true;
        }
        if (variableModule && variableModule !== this) {
            this.imports.add(variable);
        }
    }
    shimMissingExport(name) {
        this.graph.warn({
            code: 'SHIMMED_EXPORT',
            exporter: relativeId(this.id),
            exportName: name,
            message: `Missing export "${name}" has been shimmed in module ${relativeId(this.id)}.`
        });
        this.exports[name] = MISSING_EXPORT_SHIM_DESCRIPTION;
    }
}

class Source {
    constructor(filename, content) {
        this.isOriginal = true;
        this.filename = filename;
        this.content = content;
    }
    traceSegment(line, column, name) {
        return { line, column, name, source: this };
    }
}
class Link {
    constructor(map, sources) {
        this.sources = sources;
        this.names = map.names;
        this.mappings = map.mappings;
    }
    traceMappings() {
        const sources = [];
        const sourcesContent = [];
        const names = [];
        const mappings = [];
        for (const line of this.mappings) {
            const tracedLine = [];
            for (const segment of line) {
                if (segment.length == 1)
                    continue;
                const source = this.sources[segment[1]];
                if (!source)
                    continue;
                const traced = source.traceSegment(segment[2], segment[3], segment.length === 5 ? this.names[segment[4]] : '');
                if (traced) {
                    // newer sources are more likely to be used, so search backwards.
                    let sourceIndex = sources.lastIndexOf(traced.source.filename);
                    if (sourceIndex === -1) {
                        sourceIndex = sources.length;
                        sources.push(traced.source.filename);
                        sourcesContent[sourceIndex] = traced.source.content;
                    }
                    else if (sourcesContent[sourceIndex] == null) {
                        sourcesContent[sourceIndex] = traced.source.content;
                    }
                    else if (traced.source.content != null &&
                        sourcesContent[sourceIndex] !== traced.source.content) {
                        return error({
                            message: `Multiple conflicting contents for sourcemap source ${traced.source.filename}`
                        });
                    }
                    const tracedSegment = [
                        segment[0],
                        sourceIndex,
                        traced.line,
                        traced.column
                    ];
                    if (traced.name) {
                        let nameIndex = names.indexOf(traced.name);
                        if (nameIndex === -1) {
                            nameIndex = names.length;
                            names.push(traced.name);
                        }
                        tracedSegment[4] = nameIndex;
                    }
                    tracedLine.push(tracedSegment);
                }
            }
            mappings.push(tracedLine);
        }
        return { sources, sourcesContent, names, mappings };
    }
    traceSegment(line, column, name) {
        const segments = this.mappings[line];
        if (!segments)
            return null;
        // binary search through segments for the given column
        let i = 0;
        let j = segments.length - 1;
        while (i <= j) {
            const m = (i + j) >> 1;
            const segment = segments[m];
            if (segment[0] === column) {
                if (segment.length == 1)
                    return null;
                const source = this.sources[segment[1]];
                if (!source)
                    return null;
                return source.traceSegment(segment[2], segment[3], segment.length === 5 ? this.names[segment[4]] : name);
            }
            if (segment[0] > column) {
                j = m - 1;
            }
            else {
                i = m + 1;
            }
        }
        return null;
    }
}
function getLinkMap(graph) {
    return function linkMap(source, map) {
        if (map.mappings) {
            return new Link(map, [source]);
        }
        graph.warn({
            code: 'SOURCEMAP_BROKEN',
            message: `Sourcemap is likely to be incorrect: a plugin (${map.plugin}) was used to transform ` +
                "files, but didn't generate a sourcemap for the transformation. Consult the plugin " +
                'documentation for help',
            plugin: map.plugin,
            url: `https://rollupjs.org/guide/en/#warning-sourcemap-is-likely-to-be-incorrect`
        });
        return new Link({
            mappings: [],
            names: []
        }, [source]);
    };
}
function getCollapsedSourcemap(id, originalCode, originalSourcemap, sourcemapChain, linkMap) {
    let source;
    if (!originalSourcemap) {
        source = new Source(id, originalCode);
    }
    else {
        const sources = originalSourcemap.sources;
        const sourcesContent = originalSourcemap.sourcesContent || [];
        // TODO indiscriminately treating IDs and sources as normal paths is probably bad.
        const directory = path.dirname(id) || '.';
        const sourceRoot = originalSourcemap.sourceRoot || '.';
        const baseSources = sources.map((source, i) => new Source(path.resolve(directory, sourceRoot, source), sourcesContent[i]));
        source = new Link(originalSourcemap, baseSources);
    }
    return sourcemapChain.reduce(linkMap, source);
}
function collapseSourcemaps(graph, file, map, modules, bundleSourcemapChain, excludeContent) {
    const linkMap = getLinkMap(graph);
    const moduleSources = modules
        .filter(module => !module.excludeFromSourcemap)
        .map(module => getCollapsedSourcemap(module.id, module.originalCode, module.originalSourcemap, module.sourcemapChain, linkMap));
    // DecodedSourceMap (from magic-string) uses a number[] instead of the more
    // correct SourceMapSegment tuples. Cast it here to gain type safety.
    let source = new Link(map, moduleSources);
    source = bundleSourcemapChain.reduce(linkMap, source);
    let { sources, sourcesContent, names, mappings } = source.traceMappings();
    if (file) {
        const directory = path.dirname(file);
        sources = sources.map((source) => path.relative(directory, source));
        file = path.basename(file);
    }
    sourcesContent = (excludeContent ? null : sourcesContent);
    return new SourceMap({ file, sources, sourcesContent, names, mappings });
}
function collapseSourcemap(graph, id, originalCode, originalSourcemap, sourcemapChain) {
    if (!sourcemapChain.length) {
        return originalSourcemap;
    }
    const source = getCollapsedSourcemap(id, originalCode, originalSourcemap, sourcemapChain, getLinkMap(graph));
    const map = source.traceMappings();
    return { version: 3, ...map };
}

const createHash = () => crypto.createHash('sha256');

const DECONFLICT_IMPORTED_VARIABLES_BY_FORMAT = {
    amd: deconflictImportsOther,
    cjs: deconflictImportsOther,
    es: deconflictImportsEsm,
    iife: deconflictImportsOther,
    system: deconflictImportsEsmOrSystem,
    umd: deconflictImportsOther
};
function deconflictChunk(modules, dependencies, imports, usedNames, format, interop, preserveModules, syntheticExports) {
    for (const module of modules) {
        module.scope.addUsedOutsideNames(usedNames, format);
    }
    deconflictTopLevelVariables(usedNames, modules);
    DECONFLICT_IMPORTED_VARIABLES_BY_FORMAT[format](usedNames, imports, dependencies, interop, preserveModules, syntheticExports);
    for (const module of modules) {
        module.scope.deconflict(format);
    }
}
function deconflictImportsEsm(usedNames, imports, dependencies, interop, preserveModules, syntheticExports) {
    // Deconflict re-exported variables of dependencies when preserveModules is true.
    // However, this implementation will result in unnecessary variable renaming without
    // a deeper, wider fix.
    //
    // TODO: https://github.com/rollup/rollup/pull/3435#discussion_r390792792
    if (preserveModules) {
        for (const chunkOrExternalModule of dependencies) {
            chunkOrExternalModule.variableName = getSafeName(chunkOrExternalModule.variableName, usedNames);
        }
    }
    deconflictImportsEsmOrSystem(usedNames, imports, dependencies, interop);
    for (const variable of syntheticExports) {
        variable.setSafeName(getSafeName(variable.name, usedNames));
    }
}
function deconflictImportsEsmOrSystem(usedNames, imports, _dependencies, interop) {
    for (const variable of imports) {
        const module = variable.module;
        const name = variable.name;
        let proposedName;
        if (module instanceof ExternalModule && (name === '*' || name === 'default')) {
            if (name === 'default' && interop && module.exportsNamespace) {
                proposedName = module.variableName + '__default';
            }
            else {
                proposedName = module.variableName;
            }
        }
        else {
            proposedName = name;
        }
        variable.setRenderNames(null, getSafeName(proposedName, usedNames));
    }
}
function deconflictImportsOther(usedNames, imports, dependencies, interop, preserveModules) {
    for (const chunkOrExternalModule of dependencies) {
        chunkOrExternalModule.variableName = getSafeName(chunkOrExternalModule.variableName, usedNames);
    }
    for (const variable of imports) {
        const module = variable.module;
        if (module instanceof ExternalModule) {
            const name = variable.name;
            if (name === 'default' && interop && (module.exportsNamespace || module.exportsNames)) {
                variable.setRenderNames(null, module.variableName + '__default');
            }
            else if (name === '*' || name === 'default') {
                variable.setRenderNames(null, module.variableName);
            }
            else {
                variable.setRenderNames(module.variableName, null);
            }
        }
        else {
            const chunk = module.chunk;
            if (chunk.exportMode === 'default' || (preserveModules && variable.isNamespace)) {
                variable.setRenderNames(null, chunk.variableName);
            }
            else {
                variable.setRenderNames(chunk.variableName, chunk.getVariableExportName(variable));
            }
        }
    }
}
function deconflictTopLevelVariables(usedNames, modules) {
    for (const module of modules) {
        for (const variable of module.scope.variables.values()) {
            if (variable.included &&
                // this will only happen for exports in some formats
                !(variable.renderBaseName ||
                    (variable instanceof ExportDefaultVariable && variable.getOriginalVariable() !== variable))) {
                variable.setRenderNames(null, getSafeName(variable.name, usedNames));
            }
        }
        const namespace = module.namespace;
        if (namespace.included) {
            namespace.setRenderNames(null, getSafeName(namespace.name, usedNames));
        }
    }
}

const compareExecIndex = (unitA, unitB) => unitA.execIndex > unitB.execIndex ? 1 : -1;
function sortByExecutionOrder(units) {
    units.sort(compareExecIndex);
}
function analyseModuleExecution(entryModules) {
    let nextExecIndex = 0;
    const cyclePaths = [];
    const analysedModules = new Set();
    const dynamicImports = new Set();
    const parents = new Map();
    const orderedModules = [];
    const analyseModule = (module) => {
        if (module instanceof Module) {
            for (const dependency of module.dependencies) {
                if (parents.has(dependency)) {
                    if (!analysedModules.has(dependency)) {
                        cyclePaths.push(getCyclePath(dependency, module, parents));
                    }
                    continue;
                }
                parents.set(dependency, module);
                analyseModule(dependency);
            }
            for (const { resolution } of module.dynamicImports) {
                if (resolution instanceof Module && !dynamicImports.has(resolution)) {
                    dynamicImports.add(resolution);
                }
            }
            orderedModules.push(module);
        }
        module.execIndex = nextExecIndex++;
        analysedModules.add(module);
    };
    for (const curEntry of entryModules) {
        if (!parents.has(curEntry)) {
            parents.set(curEntry, null);
            analyseModule(curEntry);
        }
    }
    for (const curEntry of dynamicImports) {
        if (!parents.has(curEntry)) {
            parents.set(curEntry, null);
            analyseModule(curEntry);
        }
    }
    return { orderedModules, cyclePaths };
}
function getCyclePath(module, parent, parents) {
    const path = [relativeId(module.id)];
    let nextModule = parent;
    while (nextModule !== module) {
        path.push(relativeId(nextModule.id));
        nextModule = parents.get(nextModule);
    }
    path.push(path[0]);
    path.reverse();
    return path;
}

function assignExportsToMangledNames(exports, exportsByName) {
    let nameIndex = 0;
    for (const variable of exports) {
        const suggestedName = variable.name[0];
        if (!exportsByName[suggestedName]) {
            exportsByName[suggestedName] = variable;
        }
        else {
            let safeExportName;
            do {
                safeExportName = toBase64(++nameIndex);
                // skip past leading number identifiers
                if (safeExportName.charCodeAt(0) === 49 /* '1' */) {
                    nameIndex += 9 * 64 ** (safeExportName.length - 1);
                    safeExportName = toBase64(nameIndex);
                }
            } while (RESERVED_NAMES[safeExportName] || exportsByName[safeExportName]);
            exportsByName[safeExportName] = variable;
        }
    }
}
function assignExportsToNames(exports, exportsByName) {
    for (const variable of exports) {
        let nameIndex = 0;
        let safeExportName = variable.name;
        while (exportsByName[safeExportName]) {
            safeExportName = variable.name + '$' + ++nameIndex;
        }
        exportsByName[safeExportName] = variable;
    }
}

function guessIndentString(code) {
    const lines = code.split('\n');
    const tabbed = lines.filter(line => /^\t+/.test(line));
    const spaced = lines.filter(line => /^ {2,}/.test(line));
    if (tabbed.length === 0 && spaced.length === 0) {
        return null;
    }
    // More lines tabbed than spaced? Assume tabs, and
    // default to tabs in the case of a tie (or nothing
    // to go on)
    if (tabbed.length >= spaced.length) {
        return '\t';
    }
    // Otherwise, we need to guess the multiple
    const min = spaced.reduce((previous, current) => {
        const numSpaces = /^ +/.exec(current)[0].length;
        return Math.min(numSpaces, previous);
    }, Infinity);
    return new Array(min + 1).join(' ');
}
function getIndentString(modules, options) {
    if (options.indent !== true)
        return options.indent || '';
    for (let i = 0; i < modules.length; i++) {
        const indent = guessIndentString(modules[i].originalCode);
        if (indent !== null)
            return indent;
    }
    return '\t';
}

function decodedSourcemap(map) {
    if (!map)
        return null;
    if (typeof map === 'string') {
        map = JSON.parse(map);
    }
    if (map.mappings === '') {
        return {
            mappings: [],
            names: [],
            sources: [],
            version: 3
        };
    }
    let mappings;
    if (typeof map.mappings === 'string') {
        mappings = decode(map.mappings);
    }
    else {
        mappings = map.mappings;
    }
    return { ...map, mappings };
}

function renderChunk({ code, options, outputPluginDriver, renderChunk, sourcemapChain }) {
    const renderChunkReducer = (code, result, plugin) => {
        if (result == null)
            return code;
        if (typeof result === 'string')
            result = {
                code: result,
                map: undefined
            };
        // strict null check allows 'null' maps to not be pushed to the chain, while 'undefined' gets the missing map warning
        if (result.map !== null) {
            const map = decodedSourcemap(result.map);
            sourcemapChain.push(map || { missing: true, plugin: plugin.name });
        }
        return result.code;
    };
    return outputPluginDriver.hookReduceArg0('renderChunk', [code, renderChunk, options], renderChunkReducer);
}

function renderNamePattern(pattern, patternName, replacements) {
    if (!isPlainPathFragment(pattern))
        return error(errFailedValidation(`Invalid pattern "${pattern}" for "${patternName}", patterns can be neither absolute nor relative paths and must not contain invalid characters.`));
    return pattern.replace(/\[(\w+)\]/g, (_match, type) => {
        if (!replacements.hasOwnProperty(type)) {
            return error(errFailedValidation(`"[${type}]" is not a valid placeholder in "${patternName}" pattern.`));
        }
        const replacement = replacements[type]();
        if (!isPlainPathFragment(replacement))
            return error(errFailedValidation(`Invalid substitution "${replacement}" for placeholder "[${type}]" in "${patternName}" pattern, can be neither absolute nor relative path.`));
        return replacement;
    });
}
function makeUnique(name, existingNames) {
    const existingNamesLowercase = new Set(Object.keys(existingNames).map(key => key.toLowerCase()));
    if (!existingNamesLowercase.has(name.toLocaleLowerCase()))
        return name;
    const ext = path.extname(name);
    name = name.substr(0, name.length - ext.length);
    let uniqueName, uniqueIndex = 1;
    while (existingNamesLowercase.has((uniqueName = name + ++uniqueIndex + ext).toLowerCase()))
        ;
    return uniqueName;
}

const NON_ASSET_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
function getGlobalName(module, globals, graph, hasExports) {
    let globalName;
    if (typeof globals === 'function') {
        globalName = globals(module.id);
    }
    else if (globals) {
        globalName = globals[module.id];
    }
    if (globalName) {
        return globalName;
    }
    if (hasExports) {
        graph.warn({
            code: 'MISSING_GLOBAL_NAME',
            guess: module.variableName,
            message: `No name was provided for external module '${module.id}' in output.globals – guessing '${module.variableName}'`,
            source: module.id
        });
        return module.variableName;
    }
}
class Chunk$1 {
    constructor(graph, orderedModules) {
        this.entryModules = [];
        this.exportMode = 'named';
        this.facadeModule = null;
        this.id = null;
        this.indentString = undefined;
        this.isDynamicEntry = false;
        this.manualChunkAlias = null;
        this.usedModules = undefined;
        this.variableName = 'chunk';
        this.dependencies = new Set();
        this.dynamicDependencies = new Set();
        this.dynamicEntryModules = [];
        this.exports = new Set();
        this.exportsByName = Object.create(null);
        this.fileName = null;
        this.imports = new Set();
        this.isEmpty = true;
        this.name = null;
        this.needsExportsShim = false;
        this.renderedDependencies = null;
        this.renderedExports = null;
        this.renderedHash = undefined;
        this.renderedModuleSources = new Map();
        this.renderedSource = null;
        this.sortedExportNames = null;
        this.strictFacade = false;
        this.graph = graph;
        this.orderedModules = orderedModules;
        this.execIndex = orderedModules.length > 0 ? orderedModules[0].execIndex : Infinity;
        for (const module of orderedModules) {
            if (this.isEmpty && module.isIncluded()) {
                this.isEmpty = false;
            }
            if (module.manualChunkAlias) {
                this.manualChunkAlias = module.manualChunkAlias;
            }
            module.chunk = this;
            if (module.isEntryPoint) {
                this.entryModules.push(module);
            }
            if (module.includedDynamicImporters.length > 0) {
                this.dynamicEntryModules.push(module);
            }
        }
        const moduleForNaming = this.entryModules[0] ||
            this.dynamicEntryModules[0] ||
            this.orderedModules[this.orderedModules.length - 1];
        if (moduleForNaming) {
            this.variableName = makeLegal(path.basename(moduleForNaming.chunkName ||
                moduleForNaming.manualChunkAlias ||
                getAliasName(moduleForNaming.id)));
        }
    }
    static generateFacade(graph, facadedModule, facadeName) {
        const chunk = new Chunk$1(graph, []);
        chunk.assignFacadeName(facadeName, facadedModule);
        if (!facadedModule.facadeChunk) {
            facadedModule.facadeChunk = chunk;
        }
        for (const dependency of facadedModule.getDependenciesToBeIncluded()) {
            chunk.dependencies.add(dependency instanceof Module ? dependency.chunk : dependency);
        }
        if (!chunk.dependencies.has(facadedModule.chunk) && facadedModule.hasEffects()) {
            chunk.dependencies.add(facadedModule.chunk);
        }
        chunk.facadeModule = facadedModule;
        chunk.strictFacade = true;
        return chunk;
    }
    canModuleBeFacade(module, exposedNamespaces) {
        const moduleExportNamesByVariable = module.getExportNamesByVariable();
        for (const exposedVariable of this.exports) {
            if (!moduleExportNamesByVariable.has(exposedVariable)) {
                if (moduleExportNamesByVariable.size === 0 &&
                    module.isUserDefinedEntryPoint &&
                    module.preserveSignature === 'strict' &&
                    this.graph.preserveEntrySignatures === undefined) {
                    this.graph.warn({
                        code: 'EMPTY_FACADE',
                        id: module.id,
                        message: `To preserve the export signature of the entry module "${relativeId(module.id)}", an empty facade chunk was created. This often happens when creating a bundle for a web app where chunks are placed in script tags and exports are ignored. In this case it is recommended to set "preserveEntrySignatures: false" to avoid this and reduce the number of chunks. Otherwise if this is intentional, set "preserveEntrySignatures: 'strict'" explicitly to silence this warning.`,
                        url: 'https://rollupjs.org/guide/en/#preserveentrysignatures'
                    });
                }
                return false;
            }
        }
        for (const exposedVariable of exposedNamespaces) {
            if (!(moduleExportNamesByVariable.has(exposedVariable) || exposedVariable.module === module)) {
                return false;
            }
        }
        return true;
    }
    generateExports(options) {
        this.sortedExportNames = null;
        this.exportsByName = Object.create(null);
        const remainingExports = new Set(this.exports);
        if (this.facadeModule !== null &&
            (this.facadeModule.preserveSignature !== false || this.strictFacade)) {
            const exportNamesByVariable = this.facadeModule.getExportNamesByVariable();
            for (const [variable, exportNames] of exportNamesByVariable) {
                for (const exportName of exportNames) {
                    this.exportsByName[exportName] = variable;
                }
                remainingExports.delete(variable);
            }
        }
        if (options.minifyInternalExports === true ||
            (typeof options.minifyInternalExports !== 'boolean' &&
                (options.format === 'system' || options.format === 'es' || options.compact))) {
            assignExportsToMangledNames(remainingExports, this.exportsByName);
        }
        else {
            assignExportsToNames(remainingExports, this.exportsByName);
        }
    }
    generateFacades() {
        const facades = [];
        const dynamicEntryModules = this.dynamicEntryModules.filter(module => module.includedDynamicImporters.some(importingModule => importingModule.chunk !== this));
        this.isDynamicEntry = dynamicEntryModules.length > 0;
        const exposedNamespaces = dynamicEntryModules.map(module => module.namespace);
        for (const module of this.entryModules) {
            const requiredFacades = [...module.userChunkNames].map(name => ({
                name
            }));
            if (requiredFacades.length === 0 && module.isUserDefinedEntryPoint) {
                requiredFacades.push({});
            }
            requiredFacades.push(...[...module.chunkFileNames].map(fileName => ({ fileName })));
            if (requiredFacades.length === 0) {
                requiredFacades.push({});
            }
            if (!this.facadeModule &&
                (this.graph.preserveModules ||
                    module.preserveSignature !== 'strict' ||
                    this.canModuleBeFacade(module, exposedNamespaces))) {
                this.facadeModule = module;
                module.facadeChunk = this;
                this.strictFacade = module.preserveSignature === 'strict';
                this.assignFacadeName(requiredFacades.shift(), module);
            }
            for (const facadeName of requiredFacades) {
                facades.push(Chunk$1.generateFacade(this.graph, module, facadeName));
            }
        }
        for (const module of dynamicEntryModules) {
            if (!this.facadeModule && this.canModuleBeFacade(module, exposedNamespaces)) {
                this.facadeModule = module;
                module.facadeChunk = this;
                this.strictFacade = true;
                this.assignFacadeName({}, module);
            }
            else if (this.facadeModule === module &&
                !this.strictFacade &&
                this.canModuleBeFacade(module, exposedNamespaces)) {
                this.strictFacade = true;
            }
            else if (!(module.facadeChunk && module.facadeChunk.strictFacade)) {
                module.namespace.include();
                this.exports.add(module.namespace);
            }
        }
        return facades;
    }
    generateId(addons, options, existingNames, includeHash, outputPluginDriver) {
        if (this.fileName !== null) {
            return this.fileName;
        }
        const [pattern, patternName] = this.facadeModule && this.facadeModule.isUserDefinedEntryPoint
            ? [options.entryFileNames || '[name].js', 'output.entryFileNames']
            : [options.chunkFileNames || '[name]-[hash].js', 'output.chunkFileNames'];
        return makeUnique(renderNamePattern(pattern, patternName, {
            format: () => options.format,
            hash: () => includeHash
                ? this.computeContentHashWithDependencies(addons, options, existingNames, outputPluginDriver)
                : '[hash]',
            name: () => this.getChunkName()
        }), existingNames);
    }
    generateIdPreserveModules(preserveModulesRelativeDir, options, existingNames) {
        const id = this.orderedModules[0].id;
        const sanitizedId = sanitizeFileName(id);
        let path$1;
        if (isAbsolute(id)) {
            const extension = path.extname(id);
            const name = renderNamePattern(options.entryFileNames ||
                (NON_ASSET_EXTENSIONS.includes(extension) ? '[name].js' : '[name][extname].js'), 'output.entryFileNames', {
                ext: () => extension.substr(1),
                extname: () => extension,
                format: () => options.format,
                name: () => this.getChunkName()
            });
            path$1 = relative(preserveModulesRelativeDir, `${path.dirname(sanitizedId)}/${name}`);
        }
        else {
            path$1 = `_virtual/${path.basename(sanitizedId)}`;
        }
        return makeUnique(normalize(path$1), existingNames);
    }
    getChunkName() {
        return this.name || (this.name = sanitizeFileName(this.getFallbackChunkName()));
    }
    getDynamicImportIds() {
        return [...this.dynamicDependencies].map(chunk => chunk.id);
    }
    getExportNames() {
        return (this.sortedExportNames || (this.sortedExportNames = Object.keys(this.exportsByName).sort()));
    }
    getImportIds() {
        return [...this.dependencies].map(chunk => chunk.id);
    }
    getRenderedHash(outputPluginDriver) {
        if (this.renderedHash)
            return this.renderedHash;
        const hash = createHash();
        const hashAugmentation = outputPluginDriver.hookReduceValueSync('augmentChunkHash', '', [this.getPrerenderedChunk()], (hashAugmentation, pluginHash) => {
            if (pluginHash) {
                hashAugmentation += pluginHash;
            }
            return hashAugmentation;
        });
        hash.update(hashAugmentation);
        hash.update(this.renderedSource.toString());
        hash.update(this.getExportNames()
            .map(exportName => {
            const variable = this.exportsByName[exportName];
            return `${relativeId(variable.module.id).replace(/\\/g, '/')}:${variable.name}:${exportName}`;
        })
            .join(','));
        return (this.renderedHash = hash.digest('hex'));
    }
    getVariableExportName(variable) {
        if (this.graph.preserveModules && variable instanceof NamespaceVariable) {
            return '*';
        }
        for (const exportName of Object.keys(this.exportsByName)) {
            if (this.exportsByName[exportName] === variable)
                return exportName;
        }
        throw new Error(`Internal Error: Could not find export name for variable ${variable.name}.`);
    }
    link() {
        for (const module of this.orderedModules) {
            this.addDependenciesToChunk(module.getDependenciesToBeIncluded(), this.dependencies);
            this.addDependenciesToChunk(module.dynamicDependencies, this.dynamicDependencies);
            this.setUpChunkImportsAndExportsForModule(module);
        }
    }
    // prerender allows chunk hashes and names to be generated before finalizing
    preRender(options, inputBase, outputPluginDriver) {
        timeStart('render modules', 3);
        const magicString = new Bundle({ separator: options.compact ? '' : '\n\n' });
        this.usedModules = [];
        this.indentString = options.compact ? '' : getIndentString(this.orderedModules, options);
        const n = options.compact ? '' : '\n';
        const _ = options.compact ? '' : ' ';
        const renderOptions = {
            compact: options.compact,
            dynamicImportFunction: options.dynamicImportFunction,
            format: options.format,
            freeze: options.freeze !== false,
            indent: this.indentString,
            namespaceToStringTag: options.namespaceToStringTag === true,
            outputPluginDriver,
            varOrConst: options.preferConst ? 'const' : 'var'
        };
        // for static and dynamic entry points, inline the execution list to avoid loading latency
        if (options.hoistTransitiveImports !== false &&
            !this.graph.preserveModules &&
            this.facadeModule !== null) {
            for (const dep of this.dependencies) {
                if (dep instanceof Chunk$1)
                    this.inlineChunkDependencies(dep);
            }
        }
        const sortedDependencies = [...this.dependencies];
        sortByExecutionOrder(sortedDependencies);
        this.dependencies = new Set(sortedDependencies);
        this.prepareDynamicImports();
        this.setIdentifierRenderResolutions(options);
        let hoistedSource = '';
        const renderedModules = (this.renderedModules = Object.create(null));
        for (const module of this.orderedModules) {
            let renderedLength = 0;
            if (module.isIncluded()) {
                const source = module.render(renderOptions).trim();
                renderedLength = source.length();
                if (renderedLength) {
                    if (options.compact && source.lastLine().indexOf('//') !== -1)
                        source.append('\n');
                    this.renderedModuleSources.set(module, source);
                    magicString.addSource(source);
                    this.usedModules.push(module);
                }
                const namespace = module.namespace;
                if (namespace.included && !this.graph.preserveModules) {
                    const rendered = namespace.renderBlock(renderOptions);
                    if (namespace.renderFirst())
                        hoistedSource += n + rendered;
                    else
                        magicString.addSource(new MagicString(rendered));
                }
            }
            const { renderedExports, removedExports } = module.getRenderedExports();
            renderedModules[module.id] = {
                originalLength: module.originalCode.length,
                removedExports,
                renderedExports,
                renderedLength
            };
        }
        if (hoistedSource)
            magicString.prepend(hoistedSource + n + n);
        if (this.needsExportsShim) {
            magicString.prepend(`${n}${renderOptions.varOrConst} ${MISSING_EXPORT_SHIM_VARIABLE}${_}=${_}void 0;${n}${n}`);
        }
        if (options.compact) {
            this.renderedSource = magicString;
        }
        else {
            this.renderedSource = magicString.trim();
        }
        this.renderedHash = undefined;
        if (this.isEmpty && this.getExportNames().length === 0 && this.dependencies.size === 0) {
            const chunkName = this.getChunkName();
            this.graph.warn({
                chunkName,
                code: 'EMPTY_BUNDLE',
                message: `Generated an empty chunk: "${chunkName}"`
            });
        }
        this.setExternalRenderPaths(options, inputBase);
        this.renderedDependencies = this.getChunkDependencyDeclarations(options);
        this.renderedExports =
            this.exportMode === 'none'
                ? []
                : this.getChunkExportDeclarations(options.format);
        timeEnd('render modules', 3);
    }
    async render(options, addons, outputChunk, outputPluginDriver) {
        timeStart('render format', 3);
        const chunkId = this.id;
        const format = options.format;
        const finalise = finalisers[format];
        if (options.dynamicImportFunction && format !== 'es') {
            this.graph.warn({
                code: 'INVALID_OPTION',
                message: '"output.dynamicImportFunction" is ignored for formats other than "es".'
            });
        }
        // populate ids in the rendered declarations only here
        // as chunk ids known only after prerender
        for (const dependency of this.dependencies) {
            if (dependency instanceof ExternalModule && !dependency.renormalizeRenderPath)
                continue;
            const renderedDependency = this.renderedDependencies.get(dependency);
            const depId = dependency instanceof ExternalModule ? renderedDependency.id : dependency.id;
            if (dependency instanceof Chunk$1)
                renderedDependency.namedExportsMode = dependency.exportMode !== 'default';
            renderedDependency.id = this.getRelativePath(depId, false);
        }
        this.finaliseDynamicImports(options);
        this.finaliseImportMetas(format, outputPluginDriver);
        const hasExports = this.renderedExports.length !== 0 ||
            [...this.renderedDependencies.values()].some(dep => (dep.reexports && dep.reexports.length !== 0));
        let usesTopLevelAwait = false;
        const accessedGlobals = new Set();
        for (const module of this.orderedModules) {
            if (module.usesTopLevelAwait) {
                usesTopLevelAwait = true;
            }
            const accessedGlobalVariablesByFormat = module.scope.accessedGlobalVariablesByFormat;
            const accessedGlobalVariables = accessedGlobalVariablesByFormat && accessedGlobalVariablesByFormat.get(format);
            if (accessedGlobalVariables) {
                for (const name of accessedGlobalVariables) {
                    accessedGlobals.add(name);
                }
            }
        }
        if (usesTopLevelAwait && format !== 'es' && format !== 'system') {
            return error({
                code: 'INVALID_TLA_FORMAT',
                message: `Module format ${format} does not support top-level await. Use the "es" or "system" output formats rather.`
            });
        }
        const magicString = finalise(this.renderedSource, {
            accessedGlobals,
            dependencies: [...this.renderedDependencies.values()],
            exports: this.renderedExports,
            hasExports,
            indentString: this.indentString,
            intro: addons.intro,
            isEntryModuleFacade: this.graph.preserveModules ||
                (this.facadeModule !== null && this.facadeModule.isEntryPoint),
            namedExportsMode: this.exportMode !== 'default',
            outro: addons.outro,
            usesTopLevelAwait,
            varOrConst: options.preferConst ? 'const' : 'var',
            warn: this.graph.warn.bind(this.graph)
        }, options);
        if (addons.banner)
            magicString.prepend(addons.banner);
        if (addons.footer)
            magicString.append(addons.footer);
        const prevCode = magicString.toString();
        timeEnd('render format', 3);
        let map = null;
        const chunkSourcemapChain = [];
        let code = await renderChunk({
            code: prevCode,
            options,
            outputPluginDriver,
            renderChunk: outputChunk,
            sourcemapChain: chunkSourcemapChain
        });
        if (options.sourcemap) {
            timeStart('sourcemap', 3);
            let file;
            if (options.file)
                file = path.resolve(options.sourcemapFile || options.file);
            else if (options.dir)
                file = path.resolve(options.dir, chunkId);
            else
                file = path.resolve(chunkId);
            const decodedMap = magicString.generateDecodedMap({});
            map = collapseSourcemaps(this.graph, file, decodedMap, this.usedModules, chunkSourcemapChain, options.sourcemapExcludeSources);
            map.sources = map.sources.map(sourcePath => normalize(options.sourcemapPathTransform ? options.sourcemapPathTransform(sourcePath) : sourcePath));
            timeEnd('sourcemap', 3);
        }
        if (options.compact !== true && code[code.length - 1] !== '\n')
            code += '\n';
        return { code, map };
    }
    addDependenciesToChunk(moduleDependencies, chunkDependencies) {
        for (const depModule of moduleDependencies) {
            if (depModule instanceof Module) {
                if (depModule.chunk && depModule.chunk !== this) {
                    chunkDependencies.add(depModule.chunk);
                }
            }
            else {
                chunkDependencies.add(depModule);
            }
        }
    }
    assignFacadeName({ fileName, name }, facadedModule) {
        if (fileName) {
            this.fileName = fileName;
        }
        else {
            this.name = sanitizeFileName(name || facadedModule.chunkName || getAliasName(facadedModule.id));
        }
    }
    computeContentHashWithDependencies(addons, options, existingNames, outputPluginDriver) {
        const hash = createHash();
        hash.update([addons.intro, addons.outro, addons.banner, addons.footer].map(addon => addon || '').join(':'));
        hash.update(options.format);
        const dependenciesForHashing = new Set([this]);
        for (const current of dependenciesForHashing) {
            if (current instanceof ExternalModule) {
                hash.update(':' + current.renderPath);
            }
            else {
                hash.update(current.getRenderedHash(outputPluginDriver));
                hash.update(current.generateId(addons, options, existingNames, false, outputPluginDriver));
            }
            if (current instanceof ExternalModule)
                continue;
            for (const dependency of [...current.dependencies, ...current.dynamicDependencies]) {
                dependenciesForHashing.add(dependency);
            }
        }
        return hash.digest('hex').substr(0, 8);
    }
    finaliseDynamicImports(options) {
        const stripKnownJsExtensions = options.format === 'amd';
        for (const [module, code] of this.renderedModuleSources) {
            for (const { node, resolution } of module.dynamicImports) {
                if (!resolution ||
                    !node.included ||
                    (resolution instanceof Module && resolution.chunk === this)) {
                    continue;
                }
                const renderedResolution = resolution instanceof Module
                    ? `'${this.getRelativePath((resolution.facadeChunk || resolution.chunk).id, stripKnownJsExtensions)}'`
                    : resolution instanceof ExternalModule
                        ? `'${resolution.renormalizeRenderPath
                            ? this.getRelativePath(resolution.renderPath, stripKnownJsExtensions)
                            : resolution.renderPath}'`
                        : resolution;
                node.renderFinalResolution(code, renderedResolution, resolution instanceof Module &&
                    !(resolution.facadeChunk && resolution.facadeChunk.strictFacade) &&
                    resolution.namespace.exportName, options);
            }
        }
    }
    finaliseImportMetas(format, outputPluginDriver) {
        for (const [module, code] of this.renderedModuleSources) {
            for (const importMeta of module.importMetas) {
                importMeta.renderFinalMechanism(code, this.id, format, outputPluginDriver);
            }
        }
    }
    getChunkDependencyDeclarations(options) {
        const reexportDeclarations = new Map();
        for (let exportName of this.getExportNames()) {
            let exportChunk;
            let importName;
            let needsLiveBinding = false;
            if (exportName[0] === '*') {
                needsLiveBinding = options.externalLiveBindings !== false;
                exportChunk = this.graph.moduleById.get(exportName.substr(1));
                importName = exportName = '*';
            }
            else {
                const variable = this.exportsByName[exportName];
                if (variable instanceof SyntheticNamedExportVariable)
                    continue;
                const module = variable.module;
                if (!module || module.chunk === this)
                    continue;
                if (module instanceof Module) {
                    exportChunk = module.chunk;
                    importName = exportChunk.getVariableExportName(variable);
                    needsLiveBinding = variable.isReassigned;
                }
                else {
                    exportChunk = module;
                    importName = variable.name;
                    needsLiveBinding = options.externalLiveBindings !== false;
                }
            }
            let reexportDeclaration = reexportDeclarations.get(exportChunk);
            if (!reexportDeclaration)
                reexportDeclarations.set(exportChunk, (reexportDeclaration = []));
            reexportDeclaration.push({ imported: importName, reexported: exportName, needsLiveBinding });
        }
        const renderedImports = new Set();
        const dependencies = new Map();
        for (const dep of this.dependencies) {
            const imports = [];
            for (const variable of this.imports) {
                if ((variable.module instanceof Module
                    ? variable.module.chunk === dep
                    : variable.module === dep) &&
                    !renderedImports.has(variable)) {
                    renderedImports.add(variable);
                    imports.push({
                        imported: variable.module instanceof ExternalModule
                            ? variable.name
                            : variable.module.chunk.getVariableExportName(variable),
                        local: variable.getName()
                    });
                }
            }
            const reexports = reexportDeclarations.get(dep);
            let exportsNames, exportsDefault;
            let namedExportsMode = true;
            if (dep instanceof ExternalModule) {
                exportsNames = dep.exportsNames || dep.exportsNamespace;
                exportsDefault = 'default' in dep.declarations;
            }
            else {
                exportsNames = true;
                // we don't want any interop patterns to trigger
                exportsDefault = false;
                namedExportsMode = dep.exportMode !== 'default';
            }
            let id = undefined;
            let globalName = undefined;
            if (dep instanceof ExternalModule) {
                id = dep.renderPath;
                if (options.format === 'umd' || options.format === 'iife') {
                    globalName = getGlobalName(dep, options.globals, this.graph, exportsNames || exportsDefault);
                }
            }
            dependencies.set(dep, {
                exportsDefault,
                exportsNames,
                globalName,
                id,
                imports: imports.length > 0 ? imports : null,
                isChunk: dep instanceof Chunk$1,
                name: dep.variableName,
                namedExportsMode,
                reexports
            });
        }
        return dependencies;
    }
    getChunkExportDeclarations(format) {
        const exports = [];
        for (const exportName of this.getExportNames()) {
            if (exportName[0] === '*')
                continue;
            const variable = this.exportsByName[exportName];
            if (!(variable instanceof SyntheticNamedExportVariable)) {
                const module = variable.module;
                if (module && module.chunk !== this)
                    continue;
            }
            let expression = null;
            let hoisted = false;
            let uninitialized = false;
            let local = variable.getName();
            if (variable instanceof LocalVariable) {
                if (variable.init === UNDEFINED_EXPRESSION) {
                    uninitialized = true;
                }
                for (const declaration of variable.declarations) {
                    if (declaration.parent instanceof FunctionDeclaration ||
                        (declaration instanceof ExportDefaultDeclaration &&
                            declaration.declaration instanceof FunctionDeclaration)) {
                        hoisted = true;
                        break;
                    }
                }
            }
            else if (variable instanceof SyntheticNamedExportVariable) {
                expression = local;
                if (format === 'es' && exportName !== 'default') {
                    local = variable.renderName;
                }
            }
            exports.push({
                exported: exportName,
                expression,
                hoisted,
                local,
                uninitialized
            });
        }
        return exports;
    }
    getFallbackChunkName() {
        if (this.manualChunkAlias) {
            return this.manualChunkAlias;
        }
        if (this.fileName) {
            return getAliasName(this.fileName);
        }
        return getAliasName(this.orderedModules[this.orderedModules.length - 1].id);
    }
    getPrerenderedChunk() {
        const facadeModule = this.facadeModule;
        const getChunkName = this.getChunkName.bind(this);
        return {
            dynamicImports: this.getDynamicImportIds(),
            exports: this.getExportNames(),
            facadeModuleId: facadeModule && facadeModule.id,
            imports: this.getImportIds(),
            isDynamicEntry: this.isDynamicEntry,
            isEntry: facadeModule !== null && facadeModule.isEntryPoint,
            modules: this.renderedModules,
            get name() {
                return getChunkName();
            }
        };
    }
    getRelativePath(targetPath, stripJsExtension) {
        let relativePath = normalize(relative(path.dirname(this.id), targetPath));
        if (stripJsExtension && relativePath.endsWith('.js')) {
            relativePath = relativePath.slice(0, -3);
        }
        return relativePath.startsWith('../') ? relativePath : './' + relativePath;
    }
    inlineChunkDependencies(chunk) {
        for (const dep of chunk.dependencies) {
            if (this.dependencies.has(dep))
                continue;
            this.dependencies.add(dep);
            if (dep instanceof Chunk$1) {
                this.inlineChunkDependencies(dep);
            }
        }
    }
    prepareDynamicImports() {
        for (const module of this.orderedModules) {
            for (const { node, resolution } of module.dynamicImports) {
                if (!node.included)
                    continue;
                if (resolution instanceof Module) {
                    if (resolution.chunk === this) {
                        node.setInternalResolution(resolution.namespace);
                    }
                    else {
                        node.setExternalResolution(resolution.chunk.exportMode, resolution);
                    }
                }
                else {
                    node.setExternalResolution('auto', resolution);
                }
            }
        }
    }
    setExternalRenderPaths(options, inputBase) {
        for (const dependency of [...this.dependencies, ...this.dynamicDependencies]) {
            if (dependency instanceof ExternalModule) {
                dependency.setRenderPath(options, inputBase);
            }
        }
    }
    setIdentifierRenderResolutions(options) {
        const syntheticExports = new Set();
        for (const exportName of this.getExportNames()) {
            const exportVariable = this.exportsByName[exportName];
            if (exportVariable instanceof ExportShimVariable) {
                this.needsExportsShim = true;
            }
            exportVariable.exportName = exportName;
            if (options.format !== 'es' &&
                options.format !== 'system' &&
                exportVariable.isReassigned &&
                !exportVariable.isId) {
                exportVariable.setRenderNames('exports', exportName);
            }
            else if (exportVariable instanceof SyntheticNamedExportVariable) {
                syntheticExports.add(exportVariable);
            }
            else {
                exportVariable.setRenderNames(null, null);
            }
        }
        const usedNames = new Set();
        if (this.needsExportsShim) {
            usedNames.add(MISSING_EXPORT_SHIM_VARIABLE);
        }
        if (options.format !== 'es') {
            usedNames.add('exports');
            if (options.format === 'cjs') {
                usedNames
                    .add(INTEROP_DEFAULT_VARIABLE)
                    .add('require')
                    .add('module')
                    .add('__filename')
                    .add('__dirname');
            }
        }
        deconflictChunk(this.orderedModules, this.dependencies, this.imports, usedNames, options.format, options.interop !== false, this.graph.preserveModules, syntheticExports);
    }
    setUpChunkImportsAndExportsForModule(module) {
        for (let variable of module.imports) {
            if (variable instanceof SyntheticNamedExportVariable) {
                variable = variable.getBaseVariable();
            }
            else if (variable instanceof ExportDefaultVariable) {
                variable = variable.getOriginalVariable();
            }
            if (variable.module && variable.module.chunk !== this) {
                this.imports.add(variable);
                if (!(variable instanceof NamespaceVariable && this.graph.preserveModules) &&
                    variable.module instanceof Module) {
                    variable.module.chunk.exports.add(variable);
                }
            }
        }
        if ((module.isEntryPoint && module.preserveSignature !== false) ||
            module.includedDynamicImporters.some(importer => importer.chunk !== this)) {
            const map = module.getExportNamesByVariable();
            for (const exportedVariable of map.keys()) {
                if (module.isEntryPoint && module.preserveSignature !== false) {
                    this.exports.add(exportedVariable);
                }
                const isSynthetic = exportedVariable instanceof SyntheticNamedExportVariable;
                const importedVariable = isSynthetic
                    ? exportedVariable.getBaseVariable()
                    : exportedVariable;
                const exportingModule = importedVariable.module;
                if (exportingModule &&
                    exportingModule.chunk &&
                    exportingModule.chunk !== this &&
                    !(importedVariable instanceof NamespaceVariable && this.graph.preserveModules)) {
                    exportingModule.chunk.exports.add(importedVariable);
                    if (isSynthetic) {
                        this.imports.add(importedVariable);
                    }
                }
            }
        }
        if (module.namespace.included) {
            for (const reexportName of Object.keys(module.reexportDescriptions)) {
                const reexport = module.reexportDescriptions[reexportName];
                const variable = reexport.module.getVariableForExportName(reexport.localName);
                if (variable.module.chunk !== this) {
                    this.imports.add(variable);
                    variable.module.chunk.exports.add(variable);
                }
            }
        }
        for (const { node, resolution } of module.dynamicImports) {
            if (node.included && resolution instanceof Module && resolution.chunk === this)
                resolution.namespace.include();
        }
    }
}

const readFile = (file) => new Promise((fulfil, reject) => fs.readFile(file, 'utf-8', (err, contents) => (err ? reject(err) : fulfil(contents))));
function mkdirpath(path$1) {
    const dir = path.dirname(path$1);
    try {
        fs.readdirSync(dir);
    }
    catch (err) {
        mkdirpath(dir);
        try {
            fs.mkdirSync(dir);
        }
        catch (err2) {
            if (err2.code !== 'EEXIST') {
                throw err2;
            }
        }
    }
}
function writeFile(dest, data) {
    return new Promise((fulfil, reject) => {
        mkdirpath(dest);
        fs.writeFile(dest, data, err => {
            if (err) {
                reject(err);
            }
            else {
                fulfil();
            }
        });
    });
}

async function resolveId(source, importer, preserveSymlinks, pluginDriver, skip) {
    const pluginResult = await pluginDriver.hookFirst('resolveId', [source, importer], null, skip);
    if (pluginResult != null)
        return pluginResult;
    // external modules (non-entry modules that start with neither '.' or '/')
    // are skipped at this stage.
    if (importer !== undefined && !isAbsolute(source) && source[0] !== '.')
        return null;
    // `resolve` processes paths from right to left, prepending them until an
    // absolute path is created. Absolute importees therefore shortcircuit the
    // resolve call and require no special handing on our part.
    // See https://nodejs.org/api/path.html#path_path_resolve_paths
    return addJsExtensionIfNecessary(path.resolve(importer ? path.dirname(importer) : path.resolve(), source), preserveSymlinks);
}
function addJsExtensionIfNecessary(file, preserveSymlinks) {
    let found = findFile(file, preserveSymlinks);
    if (found)
        return found;
    found = findFile(file + '.mjs', preserveSymlinks);
    if (found)
        return found;
    found = findFile(file + '.js', preserveSymlinks);
    return found;
}
function findFile(file, preserveSymlinks) {
    try {
        const stats = fs.lstatSync(file);
        if (!preserveSymlinks && stats.isSymbolicLink())
            return findFile(fs.realpathSync(file), preserveSymlinks);
        if ((preserveSymlinks && stats.isSymbolicLink()) || stats.isFile()) {
            // check case
            const name = path.basename(file);
            const files = fs.readdirSync(path.dirname(file));
            if (files.indexOf(name) !== -1)
                return file;
        }
    }
    catch (_a) {
        // suppress
    }
}

const ANONYMOUS_PLUGIN_PREFIX = 'at position ';
const ANONYMOUS_OUTPUT_PLUGIN_PREFIX = 'at output position ';
function throwPluginError(err, plugin, { hook, id } = {}) {
    if (typeof err === 'string')
        err = { message: err };
    if (err.code && err.code !== Errors.PLUGIN_ERROR) {
        err.pluginCode = err.code;
    }
    err.code = Errors.PLUGIN_ERROR;
    err.plugin = plugin;
    if (hook) {
        err.hook = hook;
    }
    if (id) {
        err.id = id;
    }
    return error(err);
}
const deprecatedHooks = [
    { active: true, deprecated: 'resolveAssetUrl', replacement: 'resolveFileUrl' }
];
function warnDeprecatedHooks(plugins, graph) {
    for (const { active, deprecated, replacement } of deprecatedHooks) {
        for (const plugin of plugins) {
            if (deprecated in plugin) {
                graph.warnDeprecation({
                    message: `The "${deprecated}" hook used by plugin ${plugin.name} is deprecated. The "${replacement}" hook should be used instead.`,
                    plugin: plugin.name
                }, active);
            }
        }
    }
}

function createPluginCache(cache) {
    return {
        has(id) {
            const item = cache[id];
            if (!item)
                return false;
            item[0] = 0;
            return true;
        },
        get(id) {
            const item = cache[id];
            if (!item)
                return undefined;
            item[0] = 0;
            return item[1];
        },
        set(id, value) {
            cache[id] = [0, value];
        },
        delete(id) {
            return delete cache[id];
        }
    };
}
function getTrackedPluginCache(pluginCache, onUse) {
    return {
        has(id) {
            onUse();
            return pluginCache.has(id);
        },
        get(id) {
            onUse();
            return pluginCache.get(id);
        },
        set(id, value) {
            onUse();
            return pluginCache.set(id, value);
        },
        delete(id) {
            onUse();
            return pluginCache.delete(id);
        }
    };
}
const NO_CACHE = {
    has() {
        return false;
    },
    get() {
        return undefined;
    },
    set() { },
    delete() {
        return false;
    }
};
function uncacheablePluginError(pluginName) {
    if (pluginName.startsWith(ANONYMOUS_PLUGIN_PREFIX) ||
        pluginName.startsWith(ANONYMOUS_OUTPUT_PLUGIN_PREFIX)) {
        return error({
            code: 'ANONYMOUS_PLUGIN_CACHE',
            message: 'A plugin is trying to use the Rollup cache but is not declaring a plugin name or cacheKey.'
        });
    }
    return error({
        code: 'DUPLICATE_PLUGIN_NAME',
        message: `The plugin name ${pluginName} is being used twice in the same build. Plugin names must be distinct or provide a cacheKey (please post an issue to the plugin if you are a plugin user).`
    });
}
function getCacheForUncacheablePlugin(pluginName) {
    return {
        has() {
            return uncacheablePluginError(pluginName);
        },
        get() {
            return uncacheablePluginError(pluginName);
        },
        set() {
            return uncacheablePluginError(pluginName);
        },
        delete() {
            return uncacheablePluginError(pluginName);
        }
    };
}

function transform(graph, source, module) {
    const id = module.id;
    const sourcemapChain = [];
    let originalSourcemap = source.map === null ? null : decodedSourcemap(source.map);
    const originalCode = source.code;
    let ast = source.ast;
    const transformDependencies = [];
    const emittedFiles = [];
    let customTransformCache = false;
    const useCustomTransformCache = () => (customTransformCache = true);
    let moduleSideEffects = null;
    let syntheticNamedExports = null;
    let curPlugin;
    const curSource = source.code;
    function transformReducer(code, result, plugin) {
        if (typeof result === 'string') {
            result = {
                ast: undefined,
                code: result,
                map: undefined
            };
        }
        else if (result && typeof result === 'object') {
            if (typeof result.map === 'string') {
                result.map = JSON.parse(result.map);
            }
            if (typeof result.moduleSideEffects === 'boolean') {
                moduleSideEffects = result.moduleSideEffects;
            }
            if (typeof result.syntheticNamedExports === 'boolean') {
                syntheticNamedExports = result.syntheticNamedExports;
            }
        }
        else {
            return code;
        }
        // strict null check allows 'null' maps to not be pushed to the chain,
        // while 'undefined' gets the missing map warning
        if (result.map !== null) {
            const map = decodedSourcemap(result.map);
            sourcemapChain.push(map || { missing: true, plugin: plugin.name });
        }
        ast = result.ast;
        return result.code;
    }
    return graph.pluginDriver
        .hookReduceArg0('transform', [curSource, id], transformReducer, (pluginContext, plugin) => {
        curPlugin = plugin;
        return {
            ...pluginContext,
            cache: customTransformCache
                ? pluginContext.cache
                : getTrackedPluginCache(pluginContext.cache, useCustomTransformCache),
            warn(warning, pos) {
                if (typeof warning === 'string')
                    warning = { message: warning };
                if (pos)
                    augmentCodeLocation(warning, pos, curSource, id);
                warning.id = id;
                warning.hook = 'transform';
                pluginContext.warn(warning);
            },
            error(err, pos) {
                if (typeof err === 'string')
                    err = { message: err };
                if (pos)
                    augmentCodeLocation(err, pos, curSource, id);
                err.id = id;
                err.hook = 'transform';
                return pluginContext.error(err);
            },
            emitAsset(name, source) {
                const emittedFile = { type: 'asset', name, source };
                emittedFiles.push({ ...emittedFile });
                return graph.pluginDriver.emitFile(emittedFile);
            },
            emitChunk(id, options) {
                const emittedFile = { type: 'chunk', id, name: options && options.name };
                emittedFiles.push({ ...emittedFile });
                return graph.pluginDriver.emitFile(emittedFile);
            },
            emitFile(emittedFile) {
                emittedFiles.push(emittedFile);
                return graph.pluginDriver.emitFile(emittedFile);
            },
            addWatchFile(id) {
                transformDependencies.push(id);
                pluginContext.addWatchFile(id);
            },
            setAssetSource() {
                return this.error({
                    code: 'INVALID_SETASSETSOURCE',
                    message: `setAssetSource cannot be called in transform for caching reasons. Use emitFile with a source, or call setAssetSource in another hook.`
                });
            },
            getCombinedSourcemap() {
                const combinedMap = collapseSourcemap(graph, id, originalCode, originalSourcemap, sourcemapChain);
                if (!combinedMap) {
                    const magicString = new MagicString(originalCode);
                    return magicString.generateMap({ includeContent: true, hires: true, source: id });
                }
                if (originalSourcemap !== combinedMap) {
                    originalSourcemap = combinedMap;
                    sourcemapChain.length = 0;
                }
                return new SourceMap({
                    ...combinedMap,
                    file: null,
                    sourcesContent: combinedMap.sourcesContent
                });
            }
        };
    })
        .catch(err => throwPluginError(err, curPlugin.name, { hook: 'transform', id }))
        .then(code => {
        if (!customTransformCache) {
            // files emitted by a transform hook need to be emitted again if the hook is skipped
            if (emittedFiles.length)
                module.transformFiles = emittedFiles;
        }
        return {
            ast,
            code,
            customTransformCache,
            moduleSideEffects,
            originalCode,
            originalSourcemap,
            sourcemapChain,
            syntheticNamedExports,
            transformDependencies
        };
    });
}
