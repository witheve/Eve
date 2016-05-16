build the chat pane
  #chat-pane channel
  add
    #div class: "chat-pane"
      children:
        #div class: "chat-messages" id: "{channel}-chat-messages"
        #input #channel-input channel

draw messages
  #message name time message channel
  add
    #div parent: "{channel}-chat-messages", class: "chat-message"
      children:
        #div class: "chat-user", text: "{name}"
        #div class: "chat-time"    text: "{time}"
        #div class: "chat-message", text: "{message}"

handle chat keydowns
  #keydown element, key: "enter"
  #channel-input: element, value, channel
  #user name
  #time hours minutes
  printTime = "{hours}:{minutes}"
  update
    element.value = ""
  add forever
    #message name, time: printTime, message: value, channel
