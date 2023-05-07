
/** Used to match property names within property paths. */
const reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/
const reIsPlainProp = /^\w*$/

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
	if (Array.isArray(value)) {
		return false
	}
	const type = typeof value
	if (type === 'number' || type === 'boolean' || value == null) {
		return true
	}
	return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
		(object != null && value in Object(object))
}

function memoize(func, resolver) {
	if (typeof func !== 'function' || (resolver != null && typeof resolver !== 'function')) {
	  throw new TypeError('Expected a function')
	}
	const memoized = function(...args) {
	  const key = resolver ? resolver.apply(this, args) : args[0]
	  const cache = memoized.cache
  
	  if (cache.has(key)) {
		return cache.get(key)
	  }
	  const result = func.apply(this, args)
	  memoized.cache = cache.set(key, result) || cache
	  return result
	}
	memoized.cache = new (memoize.Cache || Map)
	return memoized
  }
  
  memoize.Cache = Map

/** Used as the maximum memoize cache size. */
const MAX_MEMOIZE_SIZE = 500

/**
 * A specialized version of `memoize` which clears the memoized function's
 * cache when it exceeds `MAX_MEMOIZE_SIZE`.
 *
 * @private
 * @param {Function} func The function to have its output memoized.
 * @returns {Function} Returns the new memoized function.
 */
function memoizeCapped(func) {
	const result = memoize(func, (key) => {
	  const { cache } = result
	  if (cache.size === MAX_MEMOIZE_SIZE) {
		cache.clear()
	  }
	  return key
	})
  
	return result
  }

const charCodeOfDot = '.'.charCodeAt(0)
const reEscapeChar = /\\(\\)?/g
const rePropName = RegExp(
	// Match anything that isn't a dot or bracket.
	'[^.[\\]]+' + '|' +
	// Or match property names within brackets.
	'\\[(?:' +
	// Match a non-string expression.
	'([^"\'][^[]*)' + '|' +
	// Or match strings (supports escaping characters).
	'(["\'])((?:(?!\\2)[^\\\\]|\\\\.)*?)\\2' +
	')\\]' + '|' +
	// Or match "" as the space between consecutive dots or empty brackets.
	'(?=(?:\\.|\\[\\])(?:\\.|\\[\\]|$))'
	, 'g')

/**
* Converts `string` to a property path array.
*
* @private
* @param {string} string The string to convert.
* @returns {Array} Returns the property path array.
*/
const stringToPath = memoizeCapped((string) => {
	const result = []
	if (string.charCodeAt(0) === charCodeOfDot) {
		result.push('')
	}
	string.replace(rePropName, (match, expression, quote, subString) => {
		let key = match
		if (quote) {
			key = subString.replace(reEscapeChar, '$1')
		}
		else if (expression) {
			key = expression.trim()
		}
		result.push(key)
	})
	return result
})

/**
 * Casts `value` to a path array if it's not one.
 *
 * @private
 * @param {*} value The value to inspect.
 * @param {Object} [object] The object to query keys on.
 * @returns {Array} Returns the cast property path array.
 */
function castPath(value, object) {
	if (Array.isArray(value)) {
		return value
	}
	return isKey(value, object) ? [value] : stringToPath(value)
}

/**
 * Converts `value` to a string key if it's not a string or symbol.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {string|symbol} Returns the key.
 */
function toKey(value) {
	if (typeof value === 'string') {
		return value
	}
	const result = `${value}`
	return result
}

/**
 * The base implementation of `get` without support for default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path) {
	path = castPath(path, object)

	let index = 0
	const length = path.length

	while (object != null && index < length) {
		object = object[toKey(path[index++])]
	}
	return (index && index == length) ? object : undefined
}

/**
 * Gets the value at `path` of `object`. If the resolved value is
 * `undefined`, the `defaultValue` is returned in its place.
 *
 * @since 3.7.0
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
 * @returns {*} Returns the resolved value.
 * @example
 *
 * const object = { 'a': [{ 'b': { 'c': 3 } }] }
 *
 * get(object, 'a[0].b.c')
 * // => 3
 *
 * get(object, ['a', '0', 'b', 'c'])
 * // => 3
 *
 * get(object, 'a.b.c', 'default')
 * // => 'default'
 */
function get(object, path, defaultValue) {
	const result = object == null ? undefined : baseGet(object, path)
	return result === undefined ? defaultValue : result
}

function toString(value) {
	if (value == null) {
		return ''
	}
	// Exit early for strings to avoid a performance hit in some environments.
	if (typeof value === 'string') {
		return value
	}
	if (Array.isArray(value)) {
		// Recursively convert values (susceptible to call stack limits).
		return `${value.map((other) => other == null ? other : toString(other))}`
	}

	const result = `${value}`
	return result
}


/**
 * @param {object} settings
 * @param {object[]} settings.rules array of rules { property, op, value, required }
 * @param {string} settings.satisfy 'ALL' or 'ANY'
 * @param {function} settings.log Function to log the evaluation process for debugging
 * @param {object} testReference The object under test
 * @returns {boolean} Null if there are no rules,therwise true/alse depending on if testReference
 */
function checkConditions(settings, reference) {
	if (!(settings && Array.isArray(settings.rules))) return null;

	let debugStr = "";
	let requiredPassed = 0;
	let normalPassed = 0;

	// build an array of booleans based on the test results
	const results = settings.rules.map((rule, index) => {
		let error;
		if (!rule.property) {
			error = new Error(`Property not specified for rule ${index}`);
			error.rule = rule;
			throw error;
		}
		let value = get(reference, rule.property);
		if (rule.property.includes("[]")) {
			let [topPath, nestedPath] = rule.property.split("[]");
			nestedPath = nestedPath.substring(1);
			value = get(reference, topPath).map((item) =>
				nestedPath ? get(item, nestedPath) : item
			);
		}

		let targetValue = rule.value;
		if (typeof settings.transformValueFn === "function") {
			targetValue = settings.transformValueFn(
				targetValue,
				reference,
				rule.property
			);
		}
		let altComparison = null;
		if (
			typeof value === "boolean" &&
			(typeof targetValue === "string" || targetValue instanceof String)
		) {
			if (targetValue.toLowerCase() === "false") altComparison = false;
			if (targetValue.toLowerCase() === "true") altComparison = true;
		}
		let result;
		switch (rule.op) {
			case "eq":
				result = value == targetValue;
				if (altComparison !== null)
					result = result || value == altComparison;
				break;
			case "ne":
			case "neq":
				result = value != targetValue;
				if (altComparison !== null)
					result = result && value != altComparison;
				break;
			case "gt":
				result = value > targetValue;
				break;
			case "gte":
				result = value >= targetValue;
				break;
			case "lt":
				result = value < targetValue;
				break;
			case "lte":
				result = value <= targetValue;
				break;
			case "startsWith":
				result = toString(value).startsWith(targetValue);
				break;
			case "endsWith":
				result = toString(value).endsWith(targetValue);
				break;
			case "contains":
				result = toString(value).includes(targetValue);
				break;
			case "present":
				result = !!value;
				break;
			case "empty":
			case "absent":
				result = !value;
				break;
			case "all":
				// To match all, check we can't find at least 1
				// value that doesn't match the expected value
				result =
					Array.isArray(value) &&
					!value.find((v) => v !== targetValue);
				break;
			case "some":
				result = Array.isArray(value) && value.includes(targetValue);
				break;
			case "none":
				result =
					(Array.isArray(value) ||
						value === null ||
						typeof value === "undefined") &&
					!(value || []).includes(targetValue);
				break;
			case "crosses":
				console.log(typeof settings.previousValueFn);
				if (typeof settings.previousValueFn !== "function") {
					throw new Error(
						'Comparison "crosses" selected, but no function supplied to return previous value'
					);
				}
				const lastValue = settings.previousValueFn(
					reference,
					rule.property
				);
				result = targetValue > lastValue && targetValue <= value;
				debugStr = `(${index}) ${rule.property} was ${lastValue} and became ${value}. crossed ${targetValue}? ${result}\n`;
				break;
			default:
				error = new Error(`Unknown comparison for rule (${rule.op})`);
				error.rule = rule;
				throw error;
		}
		if (result) {
			if (rule.required) requiredPassed += 1;
			else normalPassed += 1;
		}

		const unary = ["absent", "present"].includes(rule.op);
		debugStr += `(${index}) ${rule.property} (${value}) ${unary ? "is" : ""
			} ${rule.op} ${unary ? "" : targetValue}? ${result}\n`;

		return result;
	});

	const requiredTotal = settings.rules.reduce(
		(total, rule) => total + (rule.required ? 1 : 0),
		0
	);
	const normalTotal = settings.rules.length - requiredTotal;

	// Count how many conditions passed
	const satisfy = settings.satisfy || "ANY";

	const requiredSatisfied =
		!requiredTotal || requiredTotal === requiredPassed;
	const normalSatisfied =
		!normalTotal ||
		(satisfy === "ALL" ? normalPassed === normalTotal : normalPassed > 0);
	const outcome = normalSatisfied && requiredSatisfied;

	if (normalTotal > 0) {
		debugStr += `Passed ${normalPassed} / ${normalTotal} (need ${satisfy}, ${normalSatisfied ? "pass" : "fail"
			})\n`;
	}
	if (requiredTotal > 0)
		debugStr += `Passed ${requiredPassed} / ${requiredTotal} required conditions (${requiredSatisfied ? "pass" : "fail"
			})\n`;
	debugStr += `Result: ${outcome ? "PASS" : "FAIL"}`;
	if (settings.log) settings.log(debugStr);

	// test the result
	return outcome;
}

module.exports = checkConditions;
