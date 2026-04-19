import hre from 'hardhat';
import { deploySmartRuntime } from './deploy-runtime';

async function main() {
  await deploySmartRuntime(hre);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
