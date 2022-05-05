const utils = require('./utils');
const logger = require('./logger');
const db_api = require('./db');
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

async function categorize(file_jsons) {
    // to make the logic easier, let's assume the file metadata is an array
    if (!Array.isArray(file_jsons)) file_jsons = [file_jsons];

    let selected_category = null;
    const categories = await getCategories();
    if (!categories) {
        logger.warn('Categories could not be found.');
        return null;
    }

    for (let i = 0; i < file_jsons.length; i++) {
        const file_json = file_jsons[i];
        for (let j = 0; j < categories.length; j++) {
            const category = categories[j];
            const rules = category['rules'];
    
            // if rules for current category apply, then that is the selected category
            if (applyCategoryRules(file_json, rules, category['name'])) {
                selected_category = category;
                logger.verbose(`Selected category ${category['name']} for ${file_json['webpage_url']}`);
                return selected_category;
            }
        }
    }
    
    return selected_category;
}

async function getCategories() {
    const categories = await db_api.getRecords('categories');
    return categories ? categories : null;
}

async function getCategoriesAsPlaylists(files = null) {
    const categories_as_playlists = [];
    const available_categories = await getCategories();
    if (available_categories && files) {
        for (let category of available_categories) {
            const files_that_match = utils.addUIDsToCategory(category, files);
            if (files_that_match && files_that_match.length > 0) {
                category['thumbnailURL'] = files_that_match[0].thumbnailURL;
                category['thumbnailPath'] = files_that_match[0].thumbnailPath;
                category['duration'] = files_that_match.reduce((a, b) => a + utils.durationStringToNumber(b.duration), 0);
                category['id'] = category['uid'];
                categories_as_playlists.push(category);
            }
        }
    }
    return categories_as_playlists;
}

function applyCategoryRules(file_json, rules, category_name) {
    let rules_apply = false;
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        let rule_applies = null;

        let preceding_operator = rule['preceding_operator'];

        switch (rule['comparator']) {
            case 'includes':
                rule_applies = file_json[rule['property']].toLowerCase().includes(rule['value'].toLowerCase());
                break;
            case 'not_includes':
                rule_applies = !(file_json[rule['property']].toLowerCase().includes(rule['value'].toLowerCase()));
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

// async function addTagToVideo(tag, video, user_uid) {
//     // TODO: Implement
// }

// async function removeTagFromVideo(tag, video, user_uid) {
//     // TODO: Implement
// }

// // adds tag to list of existing tags (used for tag suggestions)
// async function addTagToExistingTags(tag) {
//     const existing_tags = db.get('tags').value();
//     if (!existing_tags.includes(tag)) {
//         db.get('tags').push(tag).write();
//     }
// }

module.exports = {
    categorize: categorize,
    getCategories: getCategories,
    getCategoriesAsPlaylists: getCategoriesAsPlaylists
}