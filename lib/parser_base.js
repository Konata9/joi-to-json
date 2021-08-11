/* eslint no-use-before-define: 'off' */
const _ = require('lodash')

class JoiJsonSchemaParser {
  constructor(joiObj) {
    if (typeof joiObj.describe !== 'function') {
      throw new Error('Not an joi object to be described.')
    }

    this.joiObj = joiObj
    this.joiDescribe = joiObj.describe()
    this.childrenFieldName = this._getChildrenFieldName()
    this.optionsFieldName = this._getOptionsFieldName()
    this.ruleArgFieldName = this._getRuleArgFieldName()
    this.enumFieldName = this._getEnumFieldName()
    this.allowUnknownFlagName = this._getAllowUnknownFlagName()
    this.jsonSchema = this._convertSchema(this.joiDescribe)
  }

  static getVersion(joiObj) {
    return joiObj._currentJoi.version
  }

  static getSupportVersion() {
    return '12'
  }

  _getChildrenFieldName() {
    return 'children'
  }

  _getOptionsFieldName() {
    return 'options'
  }

  _getRuleArgFieldName() {
    return 'arg'
  }

  _getEnumFieldName() {
    return 'valids'
  }

  _getAllowUnknownFlagName() {
    return 'allowUnknown'
  }

  _convertSchema(joiDescribe) {
    const schema = {}

    if (this._getPresence(joiDescribe) === 'forbidden') {
      schema.not = {}
      return schema
    }

    this._setBasicProperties(schema, joiDescribe)
    this._setNumberFieldProperties(schema, joiDescribe)
    this._setBinaryFieldProperties(schema, joiDescribe)
    this._setStringFieldProperties(schema, joiDescribe)
    this._setDateFieldProperties(schema, joiDescribe)
    this._setArrayFieldProperties(schema, joiDescribe)
    this._setObjectProperties(schema, joiDescribe)
    this._setAlternativesProperties(schema, joiDescribe)
    this._setAnyProperties(schema, joiDescribe)
    this._addNullTypeIfNullable(schema, joiDescribe)

    return schema
  }

  _getFieldType(fieldDefn) {
    let type = fieldDefn.type
    if (type === 'number' && !_.isEmpty(fieldDefn.rules) &&
      fieldDefn.rules[0].name === 'integer') {
      type = 'integer'
    }
    return type
  }

  _addNullTypeIfNullable(fieldSchema, fieldDefn) {
    // This should always be the last call in _convertSchema
    const enums = _.get(fieldDefn, this.enumFieldName)
    if (Array.isArray(enums) && enums.includes(null)) {
      fieldSchema.type = [fieldSchema.type, 'null']
    }
  }

  _getFieldDescription(fieldDefn) {
    return _.get(fieldDefn, 'description')
  }

  _getFieldExample(fieldDefn) {
    return _.get(fieldDefn, 'examples')
  }

  _getPresence(fieldDefn) {
    const presence = _.get(fieldDefn, 'flags.presence')
    if (presence !== undefined) {
      return presence
    }
    return _.get(fieldDefn, `${this.optionsFieldName}.presence`)
  }

  _isRequired(fieldDefn) {
    const presence = this._getPresence(fieldDefn)
    return presence === 'required'
  }

  _getDefaultValue(fieldDefn) {
    return _.get(fieldDefn, 'flags.default')
  }

  _getEnum(fieldDefn) {
    if (_.isEmpty(fieldDefn[this.enumFieldName])) {
      return undefined
    }

    const enumList = _.filter(fieldDefn[this.enumFieldName], (item) => {
      return !_.isEmpty(item)
    })
    return _.isEmpty(enumList) ? undefined : enumList
  }

  _setIfNotEmpty(schema, field, value) {
    if (value !== null && value !== undefined) {
      schema[field] = value
    }
  }

  _setBasicProperties(fieldSchema, fieldDefn) {
    this._setIfNotEmpty(fieldSchema, 'type', this._getFieldType(fieldDefn))
    this._setIfNotEmpty(fieldSchema, 'examples', this._getFieldExample(fieldDefn))
    this._setIfNotEmpty(fieldSchema, 'description', this._getFieldDescription(fieldDefn))
    this._setIfNotEmpty(fieldSchema, 'default', this._getDefaultValue(fieldDefn))
    this._setIfNotEmpty(fieldSchema, 'enum', this._getEnum(fieldDefn))
  }

  _setNumberFieldProperties(fieldSchema, fieldDefn) {
    if (fieldSchema.type !== 'number' && fieldSchema.type !== 'integer') {
      return
    }

    const ruleArgFieldName = this.ruleArgFieldName

    _.each(fieldDefn.rules, (rule) => {
      const value = rule[ruleArgFieldName]
      switch (rule.name) {
        case 'max':
          fieldSchema.maximum = value
          break
        case 'min':
          fieldSchema.minimum = value
          break
        case 'greater':
          fieldSchema.exclusiveMinimum = true
          fieldSchema.minimum = value
          break
        case 'less':
          fieldSchema.exclusiveMaximum = true
          fieldSchema.maximum = value
          break
        case 'multiple':
          fieldSchema.multipleOf = value
          break
        default:
          break
      }
    })
  }

  _setBinaryFieldProperties(fieldSchema, fieldDefn) {
    if (fieldSchema.type !== 'binary') {
      return
    }
    fieldSchema.type = 'string'
    if (fieldDefn.flags && fieldDefn.flags.encoding) {
      fieldSchema.contentEncoding = fieldDefn.flags.encoding
    }
    fieldSchema.format = 'binary'
  }

  _setStringFieldProperties(fieldSchema, fieldDefn) {
    if (fieldSchema.type !== 'string') {
      return
    }

    if (fieldDefn.flags && fieldDefn.flags.encoding) {
      fieldSchema.contentEncoding = fieldDefn.flags.encoding
    }
    _.forEach(fieldDefn.meta, (m) => {
      if (m.contentMediaType) {
        fieldSchema.contentMediaType = m.contentMediaType
      }
    })

    const ruleArgFieldName = this.ruleArgFieldName

    _.forEach(fieldDefn.rules, (rule) => {
      switch (rule.name) {
        case 'min':
          fieldSchema.minLength = rule[ruleArgFieldName]
          break
        case 'max':
          fieldSchema.maxLength = rule[ruleArgFieldName]
          break
        case 'email':
          fieldSchema.format = 'email'
          break
        case 'hostname':
          fieldSchema.format = 'hostname'
          break
        case 'uri':
          fieldSchema.format = 'uri'
          break
        case 'ip':
          const versions = rule[ruleArgFieldName].version
          if (!_.isEmpty(versions)) {
            if (versions.length === 1) {
              fieldSchema.format = versions[0]
            } else {
              fieldSchema.oneOf = _.map(versions, (version) => {
                return {
                  format: version
                }
              })
            }
          } else {
            fieldSchema.format = 'ipv4'
          }
          break
        case 'regex':
          fieldSchema.pattern = rule[ruleArgFieldName].pattern.source
          break
        case 'isoDate':
          fieldSchema.format = 'date-time'
          break
        case 'uuid':
        case 'guid':
          fieldSchema.format = 'uuid'
          break
        default:
          break
      }
    })
  }

  _setArrayFieldProperties(fieldSchema, fieldDefn) {
    if (fieldSchema.type !== 'array') {
      return
    }

    const ruleArgFieldName = this.ruleArgFieldName

    _.each(fieldDefn.rules, (rule) => {
      const value = rule[ruleArgFieldName]
      switch (rule.name) {
        case 'max':
          fieldSchema.maxItems = value
          break
        case 'min':
          fieldSchema.minItems = value
          break
        case 'length':
          fieldSchema.maxItems = value
          fieldSchema.minItems = value
          break
        case 'unique':
          fieldSchema.uniqueItems = true
          break
        default:
          break
      }
    })

    if (!fieldDefn.items) {
      fieldSchema.items = {}
      return
    }

    if (fieldDefn.items.length === 1) {
      fieldSchema.items = this._convertSchema(fieldDefn.items[0])
    } else {
      fieldSchema.items = {
        anyOf: _.map(fieldDefn.items, this._convertSchema.bind(this))
      }
    }
  }

  _setDateFieldProperties(fieldSchema, fieldDefn) {
    if (fieldSchema.type !== 'date') {
      return
    }

    if (fieldDefn.flags && fieldDefn.flags.timestamp) {
      fieldSchema.type = 'integer'
    } else {
      // https://datatracker.ietf.org/doc/draft-handrews-json-schema-validation
      // JSON Schema does not have date type, but use string with format.
      // However, joi definition cannot clearly tells the date/time/date-time format
      fieldSchema.type = 'string'
      fieldSchema.format = 'date-time'
    }
  }

  _setObjectProperties(schema, joiDescribe) {
    if (schema.type !== 'object') {
      return
    }

    schema.properties = {}
    schema.required = []

    schema.additionalProperties = _.get(joiDescribe, `${this.optionsFieldName}.allowUnknown`, false)
    if (joiDescribe.flags && typeof joiDescribe.flags[this.allowUnknownFlagName] !== 'undefined') {
      schema.additionalProperties = joiDescribe.flags[this.allowUnknownFlagName]
    }

    const that = this
    _.map(joiDescribe[this.childrenFieldName], (fieldDefn, key) => {
      const fieldSchema = that._convertSchema(fieldDefn)
      if (that._isRequired(fieldDefn)) {
        schema.required.push(key)
      }

      schema.properties[key] = fieldSchema
    })

    /**
     * For dynamic key scenarios to store the pattern as key
     * and have the properties be as with other examples
     */
     if (joiDescribe.patterns) {
      _.each(joiDescribe.patterns, patternObj => {
        if (typeof patternObj.rule !== 'object') {
          return
        }

        schema.properties[patternObj.regex] = {
          type: patternObj.rule.type,
          properties: {}
        }
        schema.properties[patternObj.regex].required = []

        const childKeys = patternObj.rule.keys || patternObj.rule.children

        _.each(childKeys, (ruleObj, key) => {
          schema.properties[patternObj.regex].properties[key] = that._convertSchema(ruleObj)

          if (that._isRequired(ruleObj)) {
            schema.properties[patternObj.regex].required.push(key)
          }
        })
      })
    }

    if (_.isEmpty(schema.required)) {
      delete schema.required
    }
  }

  _setAlternativesProperties(schema, joiDescribe) {
    if (schema.type !== 'alternatives') {
      return
    }

    const item = joiDescribe.alternatives[0]
    if (joiDescribe.alternatives.length === 1 && (item.is || item.then || item.otherwise)) {
      schema.oneOf = []
      if (item.then) {
        schema.oneOf.push(this._convertSchema(item.then))
      }
      if (item.otherwise) {
        schema.oneOf.push(this._convertSchema(item.otherwise))
      }
    } else {
      schema.oneOf = _.map(joiDescribe.alternatives, this._convertSchema.bind(this))
    }

    delete schema.type
  }

  _setAnyProperties(schema) {
    if (schema.type !== 'any') {
      return
    }

    schema.type = [
      'array',
      'boolean',
      'number',
      'object',
      'string',
      'null'
    ]
  }
}

module.exports = JoiJsonSchemaParser
