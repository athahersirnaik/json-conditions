const reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/
const reIsPlainProp = /^\w*$/

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

const stringToPath = (string) => {
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
}

function castPath(value, object) {
	if (Array.isArray(value)) {
		return value
	}
	return isKey(value, object) ? [value] : stringToPath(value)
}

function toKey(value) {
	if (typeof value === 'string') {
		return value
	}
	const result = `${value}`
	return result
}

function baseGet(object, path) {
	path = castPath(path, object)

	let index = 0
	const length = path.length

	while (object != null && index < length) {
		object = object[toKey(path[index++])]
	}
	return (index && index == length) ? object : undefined
}

function get(object, path, defaultValue) {
	const result = object == null ? undefined : baseGet(object, path)
	return result === undefined ? defaultValue : result
}

function toString(value) {
	if (value == null) {
		return ''
	}

	if (typeof value === 'string') {
		return value
	}
	if (Array.isArray(value)) {
		return `${value.map((other) => other == null ? other : toString(other))}`
	}

	const result = `${value}`
	return result
}

function checkConditions(settings, reference) {
	if (!(settings && Array.isArray(settings.rules))) return null;

	let debugStr = "";
	let requiredPassed = 0;
	let normalPassed = 0;

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

	return outcome;
}

module.exports = checkConditions;
