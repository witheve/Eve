(ns aurora.editor.component)

(def ^:dynamic *component*
  "Within a component render function, will be bound to the raw
  ReactJS component." nil)

(defn component
  "Return a function that will return a ReactJS component, using the
  provided function as the implementation for React's 'render' method
  on the component.

  The given render function should take a single immutable value as
  its first argument, and return a single ReactJS component.
  Additional arguments to the component constructor will be passed as
  additional arguments to the render function whenever it is invoked,
  but will *not* be included in any calculations regarding whether the
  component should re-render."
  [renderer]
  (let [react-component
        (.createClass js/React
           #js {:shouldComponentUpdate
                (fn [next-props _]
                  (this-as this
                           (let [diff (not
                                       (every? identity
                                               (map =
                                                    (aget (.-props this) "values")
                                                    (aget next-props "values"))))]
                             diff)))
                :render
                (fn []
                  (this-as this
                           (binding [*component* this]
                             (apply renderer
                                    (aget (.-props this) "values")))))})]
    (fn [& values]
      (react-component #js {:values values}))))

(def WrapperComponent
  "Wrapper component used to mix-in lifecycle access"
  (.createClass js/React
     #js {:render
          (fn [] (this-as this (aget (.-props this) "wrappee")))
          :componentDidUpdate
          (fn [prev-props prev-state]
            (this-as this
              (when-let [f (aget (.-props this) "onUpdate")]
                (binding [*component* this]
                  (f (.getDOMNode this))))))
          :componentDidMount
          (fn []
            (this-as this
              (when-let [f (aget (.-props this) "onMount")]
                (binding [*component* this]
                  (f (.getDOMNode this))))))
          :componentWillMount
          (fn []
            (this-as this
              (when-let [f (aget (.-props this) "onWillMount")]
                (binding [*component* this]
                  (f)))))
          :componentWillUpdate
          (fn [_ _]
            (this-as this
              (when-let [f (aget (.-props this) "onWillUpdate")]
                (binding [*component* this]
                  (f)))))
          :componentWillUnmount
          (fn []
            (this-as this
              (when-let [f (aget (.-props this) "onWillUnmount")]
                (binding [*component* this]
                  (f)))))}))



(defn on-update
  "Wrap a component, specifying a function to be called on the
  componentDidUpdate lifecycle event.

  The function will be passed the rendered DOM node."
  [child f]
  (WrapperComponent #js {:wrappee child
                         :onUpdate f}))

(defn on-mount
  "Wrap a component, specifying a function to be called on the
  componentDidMount lifecycle event.

  The function will be passed the rendered DOM node."
  [child f]
  (WrapperComponent #js {:wrappee child
                         :onMount f}))

(defn on-render
  "Wrap a component, specifying a function to be called on the
  componentDidMount AND the componentDidUpdate lifecycle events.

  The function will be passed the rendered DOM node."
  [child f]
  (WrapperComponent #js {:wrappee child
                         :onMount f
                         :onUpdate f}))


(defn on-will-mount
  "Wrap a component, specifying a function to be called on the
  componentWillMount lifecycle event.

  The function will be called with no arguments."
  [child f]
  (WrapperComponent #js {:wrappee child
                         :onWillMount f}))

(defn on-will-update
  "Wrap a component, specifying a function to be called on the
  componentWillUpdate lifecycle event.

  The function will be called with no arguments."
  [child f]
  (WrapperComponent #js {:wrappee child
                         :onWillUpdate f}))

(defn on-will-render
  "Wrap a component, specifying a function to be called on the
  componentWillMount AND the componentWillUpdate lifecycle events.

  The function will be called with no arguments."
  [child f]
  (WrapperComponent #js {:wrappee child
                         :onWillMount f
                         :onWillUpdate f}))


(defn on-will-unmount
  "Wrap a component, specifying a function to be called on the
  componentWillUnmount lifecycle event.

  The function will be called with no arguments."
  [child f]
  (WrapperComponent #js {:wrappee child
                         :onWillUnmount f}))


(defn render
  "Given a ReactJS component, immediately render it, rooted to the
  specified DOM node."
  [component node]
  (.renderComponent js/React component node))
