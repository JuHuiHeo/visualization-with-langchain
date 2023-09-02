import { MessagesPlaceholder, ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate, ConditionalPromptSelector } from "langchain/prompts";
import * as OpenAILibrary from "openai";
import { OpenAI } from "langchain/llms/openai";
import { ConversationChain, LLMChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";
import * as dotenv from "dotenv";
import * as fs from 'fs';
import * as readline from 'readline';
import * as process from 'process';

dotenv.config();


// Set prompt
const initialAgentTemplate= fs.readFileSync('initial-agent.txt', { encoding: "utf-8"});
const fewShotExamples = fs.readFileSync("few-shot-examples.txt", { encoding: "utf-8"});
const initialSystemTemplate = `${initialAgentTemplate}\n\n${fewShotExamples}`;
const humanTemplate = "{input}"
const messagePlaceholder = new MessagesPlaceholder({variableName: "history"})
const initialChatPrompt = ChatPromptTemplate.fromPromptMessages([
  SystemMessagePromptTemplate.fromTemplate(initialSystemTemplate),
  messagePlaceholder,
  HumanMessagePromptTemplate.fromTemplate(humanTemplate)
]);

const posteriorSystemTemplate1 = fs.readFileSync('posterior-agent.txt', { encoding: "utf-8"});
const posteriorSystemTemplate2 = "Now based on the chat history and specified user input, edit diagram code"
const posteriorChatPrompt = ChatPromptTemplate.fromPromptMessages([
  SystemMessagePromptTemplate.fromTemplate(posteriorSystemTemplate1),
  messagePlaceholder,
  SystemMessagePromptTemplate.fromTemplate(posteriorSystemTemplate2),
  HumanMessagePromptTemplate.fromTemplate(humanTemplate)
]);

const descriptionSystemTemplate = fs.readFileSync('description-agent.txt', { encoding: "utf-8"});
const descriptionChatPrompt = ChatPromptTemplate.fromPromptMessages([
  SystemMessagePromptTemplate.fromTemplate(descriptionSystemTemplate),
  HumanMessagePromptTemplate.fromTemplate(humanTemplate),
]);


// Set parser keywords
const keywords1 = "generated:";
const keywords2 = "details:";


// Set chain
const llm = new OpenAI({ 
  openAIApiKey: process.env.OPEN_API_KEY, 
  temperature: 0,
  maxTokens: -1,
});

const memory = new BufferMemory();
var diagramGenerationChain = new ConversationChain({
  llm: llm,
  memory: memory,
  prompt: initialChatPrompt,
  verbose: true
});

const descriptionChain = new LLMChain({
  llm: llm,
  prompt: descriptionChatPrompt,
  verbose: true
});


// description을 HTML 파일로 저장
function saveDescriptionToHtml(description){
  // 결과를 HTML 파일로 저장
  fs.writeFile('description.html', description, (err)=> console.log(err));
}


// GPT 3.5에게 D3.js 코드 설명을 요청하는 함수
async function getDescriptionFromGPT(d3Content) {
  const response = await descriptionChain.run(d3Content);
  return JSON.stringify(response)
}


// Final result
var finalResult = "empty value";


// Visualize user prompt with d3 library
const i = 0;
const { stdin: input, stdout: output } = process;
const rl = readline.createInterface({ input, output });

function goBackToQuestion(iteration) {
  console.log('시각자료 생성에 실패했습니다. 다시 말씀해주세요.');
  return iteration;
}

function goToNextQuestion(iteration) {
  console.log('시각자료를 생성했습니다. 이제부터 시작자료에 대해 설명드릴테니 궁금하거나 수정하고 싶은 부분이 있으면 편하게 말씀해주세요.');
  return iteration+1;
}

function changePrompt(){

  const llm = new OpenAI({ 
    openAIApiKey: process.env.OPEN_API_KEY, 
    modelName: 'gpt-3.5-turbo-16k',
    temperature: 0,
    maxTokens: -1
  });
  
  // Set chain
  const diagramGenerationChain = new ConversationChain({
    llm: llm,
    memory: memory,
    prompt: posteriorChatPrompt,
    verbose: false
  });

  return diagramGenerationChain
};


const threshold = 3
async function askQuestion(iteration) {
  if (iteration == 1) {
    await memory.clear();
  }

  if (iteration == 2) {
    diagramGenerationChain = changePrompt();
  }

  if (iteration <= threshold) {
    try {
      const question = await new Promise((resolve) => {
        rl.question(`만들고 싶은 시각자료를 말해주세요 (${iteration}/${threshold})`, resolve);
      });

      
      var result = await diagramGenerationChain.run(question);

      if (iteration == 1) {
          const isDalle = result.includes("[DALL-E 2 prompt]");
          const isD3 = result.includes("[D3.js code]");

          const index = result.indexOf(keywords2);

          const details = result.substring(index+keywords2.length+1, );

          if (isDalle == true && isD3 == false) {
              const dallePrompt = details;
              const openai = new OpenAILibrary.OpenAI({
                  apiKey:process.env.OPEN_API_KEY
              });
              const response = await openai.images.generate({
                  prompt: dallePrompt,
                  n: 1,
                  size: "512x512",
              });

              finalResult = response.data[0]['url'];
              return } 
          
          else if (isDalle == false && isD3 == true) {
              finalResult = details;
              fs.writeFile('image.html', details, (err) => console.log(err));}
          else {
              throw new Error('Not available generation type!');}
          } 

          if (iteration != 1) {
          finalResult = result;
          fs.writeFile('image.html', result, (err) => console.log(err));}

          // 여기서 GPT-3.5에게 전달합니다.
          const scriptContentMatch = result.match(/<script>([\s\S]+?)<\/script>/);
          const d3Content = scriptContentMatch ? scriptContentMatch[1] : ""; 
          console.log(d3Content);
          const description = await getDescriptionFromGPT(d3Content);
          saveDescriptionToHtml(description);

          return askQuestion(goToNextQuestion(iteration));
      } catch (error) {
          console.error('Error:', error);
          return askQuestion(goBackToQuestion(iteration));
        }
    } else {
      rl.close();}
}

async function runAsync() {
  try {
    await askQuestion(1);
    return
  } catch (error) {
    console.error('Error:', error);
  }
}

await runAsync();
console.log('final result', finalResult);


