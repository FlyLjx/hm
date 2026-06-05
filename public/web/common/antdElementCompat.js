(function () {
  const h = Vue.h

  function normalizeBoolean(value) {
    return value === true || value === '' || value === 'true'
  }

  function slotChildren(slots) {
    return slots.default ? slots.default() : []
  }

  window.ElementPlus = {
    ElMessage: {
      success: (message) => antd.message.success(message),
      error: (message) => antd.message.error(message),
      warning: (message) => antd.message.warning(message),
      info: (message) => antd.message.info(message),
    },
    ElMessageBox: {
      prompt(message, title, options = {}) {
        let value = options.inputValue || ''
        return new Promise((resolve, reject) => {
          antd.Modal.confirm({
            title,
            class: 'compat-prompt-modal',
            icon: options.type === 'warning' ? h('i', { class: 'ti ti-alert-circle compat-prompt-icon' }) : undefined,
            content: h('div', { class: 'compat-prompt' }, [
              h('p', { class: 'compat-prompt-message' }, message),
              h('input', {
                class: 'ant-input compat-prompt-input',
                value,
                type: options.inputType || 'text',
                placeholder: options.inputPlaceholder || '',
                autofocus: true,
                onInput: (event) => {
                  value = event.target.value
                },
                onKeydown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.target.closest('.ant-modal-content')?.querySelector('.ant-btn-primary')?.click()
                  }
                },
              }),
            ]),
            okText: options.confirmButtonText || '确定',
            cancelText: options.cancelButtonText || '取消',
            onOk: () => resolve({ value }),
            onCancel: () => reject('cancel'),
          })
        })
      },
      confirm(message, title, options = {}) {
        return new Promise((resolve, reject) => {
          antd.Modal.confirm({
            title,
            content: message,
            okText: options.confirmButtonText || '确定',
            cancelText: options.cancelButtonText || '取消',
            okType: options.type === 'warning' ? 'danger' : 'primary',
            onOk: () => resolve(),
            onCancel: () => reject('cancel'),
          })
        })
      },
    },
  }

  window.installElementCompat = function installElementCompat(app) {
    app.directive('loading', {
      mounted() {},
      updated() {},
    })

    app.component('el-button', {
      props: ['type', 'size', 'loading', 'disabled', 'link', 'nativeType', 'tag', 'href', 'target'],
      setup(props, { slots, attrs }) {
        return () => {
          const { class: attrClass, ...restAttrs } = attrs
          const isLink = normalizeBoolean(props.link)
          const type = props.type === 'primary' ? 'primary' : isLink ? 'link' : 'default'
          const danger = props.type === 'danger'
          const nodeProps = {
            ...restAttrs,
            class: [
              'el-button',
              props.type ? `el-button--${props.type}` : '',
              props.size ? `el-button--${props.size}` : '',
              attrClass,
            ],
            type,
            danger,
            loading: props.loading,
            disabled: props.disabled,
            size: props.size === 'large' ? 'large' : props.size === 'small' ? 'small' : 'middle',
            htmlType: props.nativeType || attrs.type,
            href: props.href,
            target: props.target,
          }
          return h(antd.Button, nodeProps, slotChildren(slots))
        }
      },
    })

    app.component('el-input', {
      props: ['modelValue', 'type', 'placeholder', 'rows', 'showPassword', 'disabled'],
      emits: ['update:modelValue'],
      setup(props, { emit, slots, attrs }) {
        return () => {
          const inputProps = {
            ...attrs,
            value: props.modelValue,
            placeholder: props.placeholder,
            disabled: props.disabled,
            onChange: (event) => emit('update:modelValue', event.target.value),
            onInput: (event) => emit('update:modelValue', event.target.value),
          }
          if (props.type === 'textarea') return h(antd.Input.TextArea, { ...inputProps, rows: props.rows || 3 })
          if (props.type === 'password' || props.showPassword) return h(antd.Input.Password, inputProps)
          return h(antd.Input, inputProps, slots.prefix ? { prefix: slots.prefix } : undefined)
        }
      },
    })

    app.component('el-dialog', {
      props: ['modelValue', 'title', 'width', 'closeOnClickModal', 'showClose', 'customClass'],
      emits: ['update:modelValue', 'close'],
      setup(props, { emit, slots, attrs }) {
        return () => h(antd.Modal, {
          ...attrs,
          open: props.modelValue,
          title: props.title,
          width: props.width,
          class: props.customClass,
          footer: slots.footer ? slots.footer() : null,
          onCancel: () => {
            emit('update:modelValue', false)
            emit('close')
          },
          onOk: () => emit('update:modelValue', false),
        }, {
          default: () => slotChildren(slots),
          title: slots.header,
          footer: slots.footer,
        })
      },
    })

    app.component('el-form', {
      setup(_, { slots, attrs }) {
        return () => h('form', attrs, slotChildren(slots))
      },
    })

    app.component('el-form-item', {
      props: ['label'],
      setup(props, { slots }) {
        return () => h('label', { class: 'compat-form-item' }, [
          props.label ? h('span', { class: 'compat-form-label' }, props.label) : null,
          ...slotChildren(slots),
        ])
      },
    })

    app.component('el-select', {
      props: ['modelValue', 'placeholder', 'disabled', 'popperClass'],
      emits: ['update:modelValue'],
      setup(props, { emit, slots, attrs }) {
        return () => h(antd.Select, {
          ...attrs,
          value: props.modelValue,
          placeholder: props.placeholder,
          disabled: props.disabled,
          popupClassName: props.popperClass,
          dropdownClassName: props.popperClass,
          style: attrs.style || 'width:100%',
          onChange: (value) => emit('update:modelValue', value),
        }, slotChildren(slots))
      },
    })

    app.component('el-option', {
      props: ['label', 'value', 'disabled'],
      setup(props, { slots }) {
        return () => h(
          antd.Select.Option,
          { value: props.value, label: props.label, title: props.label, disabled: props.disabled },
          slots.default ? slots.default() : props.label,
        )
      },
    })

    app.component('el-tag', {
      props: ['type', 'size'],
      setup(props, { slots }) {
        const colorMap = { success: 'green', warning: 'gold', danger: 'red', primary: 'blue', info: 'default' }
        return () => h(antd.Tag, { color: colorMap[props.type] || undefined }, slotChildren(slots))
      },
    })

    app.component('el-switch', {
      props: ['modelValue', 'activeText', 'inactiveText'],
      emits: ['update:modelValue'],
      setup(props, { emit }) {
        return () => h(antd.Switch, {
          checked: props.modelValue,
          checkedChildren: props.activeText,
          unCheckedChildren: props.inactiveText,
          onChange: (value) => emit('update:modelValue', value),
        })
      },
    })

    app.component('el-input-number', {
      props: ['modelValue', 'min', 'max', 'size'],
      emits: ['update:modelValue'],
      setup(props, { emit, attrs }) {
        return () => h(antd.InputNumber, {
          ...attrs,
          value: props.modelValue,
          min: props.min,
          max: props.max,
          size: props.size,
          onChange: (value) => emit('update:modelValue', value),
        })
      },
    })

    app.component('el-empty', {
      props: ['description'],
      setup(props) {
        return () => h(antd.Empty, { description: props.description })
      },
    })
  }
})()
