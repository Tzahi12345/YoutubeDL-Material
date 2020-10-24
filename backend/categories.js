const config_api = require('./config');

var logger = null;
var db = null;
var users_db = null;
var db_api = null;

function setDB(input_db, input_users_db, input_db_api) { db = input_db; users_db = input_users_db; db_api = input_db_api }
function setLogger(input_logger) { logger = input_logger; }

function initialize(input_db, input_users_db, input_logger, input_db_api) {
    setDB(input_db, input_users_db, input_db_api);
    setLogger(input_logger);
}

/*

Categories:

    Categories are a way to organize videos based on dynamic rules set by the user. Categories are universal (so not per-user).
    
    Categories, besides rules, have an optional custom output. This custom output can help users create their
        desired directory structure.

Rules:
    A category rule consists of a property, a comparison, and a value. For example, "uploader includes 'VEVO'"

    Rules are stored as an object with the above fields. In addition to those fields, it also has a preceding_operator, which
        is either OR or AND, and signifies whether the rule should be ANDed with the previous rules, or just ORed. For the first
        rule, this field is null.

    Ex. (title includes 'Rihanna' OR title includes 'Beyonce' AND uploader includes 'VEVO')

*/

async function categorize(file_json) {
    let selected_category = null;
    const categories = getCategories();
    if (!categories) {
        logger.warn('Categories could not be found. Initializing categories...');
        db.assign({categories: []}).write();
        return null;
        return;
    }

    for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const rules = category['rules'];

        // if rules for current category apply, then that is the selected category
        if (applyCategoryRules(file_json, rules, category['name'])) {
            selected_category = category;
            logger.verbose(`Selected category ${category['name']} for ${file_json['webpage_url']}`);
            return selected_category;
        }
    }
    return selected_category;
}

function getCategories() {
    const categories = db.get('categories').value();
    return categories ? categories : null;
}

function applyCategoryRules(file_json, rules, category_name) {
    let rules_apply = false;
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        let rule_applies = null;

        let preceding_operator = rule['preceding_operator'];

        switch (rule['comparator']) {
            case 'includes':
                rule_applies = file_json[rule['property']].includes(rule['value']);
                break;
            case 'not_includes':
                rule_applies = !(file_json[rule['property']].includes(rule['value']));
                break;
            case 'equals':
                rule_applies = file_json[rule['property']] === rule['value'];
                break;
            case 'not_equals':
                rule_applies = file_json[rule['property']] !== rule['value'];
                break;
            default:
                logger.warn(`Invalid comparison used for category ${category_name}`)
                break;
        }

        // OR the first rule with rules_apply, which will be initially false
        if (i === 0) preceding_operator = 'or';

        // update rules_apply based on current rule
        if (preceding_operator === 'or')
            rules_apply = rules_apply || rule_applies;
        else
            rules_apply = rules_apply && rule_applies;
    }

    return rules_apply;
}

async function addTagToVideo(tag, video, user_uid) {
    // TODO: Implement
}

async function removeTagFromVideo(tag, video, user_uid) {
    // TODO: Implement
}

// adds tag to list of existing tags (used for tag suggestions)
async function addTagToExistingTags(tag) {
    const existing_tags = db.get('tags').value();
    if (!existing_tags.includes(tag)) {
        db.get('tags').push(tag).write();
    }
}

module.exports = {
    initialize: initialize,
    categorize: categorize,
}