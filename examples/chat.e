build the chat pane
  [#chat-pane channel]
  update
    [#div class: "chat-pane" children:
        [#div#chat-messages class: "chat-messages" id: "{channel}-chat-messages"]
        [#input #channel-input channel]]
  end                   
            
draw messages
  parent = [#chat-messages channel]
  [#message name time message channel]
  update
    parent.children += [#div class: "chat-message", children:
                         [#div class: "chat-user", text: name]
                         [#div class: "chat-time"    text: time]
                         [#div class: "chat-message", text: message]]
  end            

handle chat keydowns
  printTime = "{hours}:{minutes}"
  update
